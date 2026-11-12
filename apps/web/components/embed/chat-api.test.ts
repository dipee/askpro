import { MAX_CHAT_MESSAGE_CHARS, type ChatRequest } from "@askwell/shared";
import { describe, expect, it, vi } from "vitest";
import {
  CHAT_ERROR_MESSAGES,
  CHAT_TIMEOUT_MS,
  CHAT_PATH,
  CONVERSATION_STORAGE_PREFIX,
  createChatSession,
  GENERIC_ERROR,
} from "./chat-api";

const KEY = "pk_0b11e40ec1e248aeb75fafae547383b3";
const VISITOR = "visitor_abcdefgh";
const CONV_1 = "11111111-1111-4111-8111-111111111111";
const CONV_2 = "22222222-2222-4222-8222-222222222222";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ok = (conversationId: string, reply = "Yes, on Saturdays.") => json(200, { conversationId, reply });
const err = (status: number, code: string) => json(status, { error: { code, message: "server text" } });

/** A fetch mock that answers with `responses` in order and records each request body. */
function mockFetch(...responses: (Response | Error)[]) {
  const bodies: ChatRequest[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(url).toBe(CHAT_PATH);
    expect(init?.method).toBe("POST");
    bodies.push(JSON.parse(String(init?.body)) as ChatRequest);
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  });
  return { fetchFn: fn as unknown as typeof fetch, bodies, fn };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("createChatSession", () => {
  it("posts the shared ChatRequest shape and returns the reply", async () => {
    const { fetchFn, bodies } = mockFetch(ok(CONV_1));
    const session = createChatSession({ publicKey: KEY, visitorId: VISITOR, fetchFn });
    await expect(session.send("  Do you fix taps?  ")).resolves.toEqual({ ok: true, reply: "Yes, on Saturdays." });
    expect(bodies).toEqual([{ key: KEY, visitorId: VISITOR, message: "Do you fix taps?" }]);
  });

  it("reuses the returned conversationId on the second message", async () => {
    const { fetchFn, bodies } = mockFetch(ok(CONV_1), ok(CONV_1, "Yes."));
    const session = createChatSession({ publicKey: KEY, visitorId: VISITOR, fetchFn });
    await session.send("First");
    await session.send("Second");
    expect(bodies[0]).not.toHaveProperty("conversationId");
    expect(bodies[1]).toEqual({ key: KEY, visitorId: VISITOR, conversationId: CONV_1, message: "Second" });
  });

  it.each([
    [429, "rate_limited", "You're sending messages too fast. Wait a moment."],
    [429, "quota_exceeded", "This chat has reached its message limit for this month."],
    [400, "message_blocked", "That message can't be answered."],
  ])("shows the friendly message for %i %s", async (status, code, message) => {
    const { fetchFn } = mockFetch(err(status, code));
    const session = createChatSession({ publicKey: KEY, visitorId: VISITOR, fetchFn });
    await expect(session.send("Hi")).resolves.toEqual({ ok: false, error: message });
    expect(CHAT_ERROR_MESSAGES[code as keyof typeof CHAT_ERROR_MESSAGES]).toBe(message);
  });

  it.each([
    ["a network error", new TypeError("Failed to fetch")],
    ["a 500", err(500, "internal")],
    ["a validation error", err(400, "validation")],
    ["an unknown code", err(418, "teapot")],
    ["a non-JSON error body", new Response("<html>Bad gateway</html>", { status: 502 })],
    ["a 200 with a bad body", json(200, { reply: 42 })],
    ["a 200 with a malformed conversationId", json(200, { reply: "Hello", conversationId: "invalid" })],
  ])("shows the generic retry message for %s", async (_name, response) => {
    const { fetchFn } = mockFetch(response);
    const session = createChatSession({ publicKey: KEY, visitorId: VISITOR, fetchFn });
    await expect(session.send("Hi")).resolves.toEqual({ ok: false, error: GENERIC_ERROR });
  });

  it("not_found for a conversation: drops the id and retries once as a new chat", async () => {
    const { fetchFn, bodies } = mockFetch(ok(CONV_1), err(404, "not_found"), ok(CONV_2, "Fresh start."));
    const session = createChatSession({ publicKey: KEY, visitorId: VISITOR, fetchFn });
    await session.send("First");
    await expect(session.send("Second")).resolves.toEqual({ ok: true, reply: "Fresh start." });
    expect(bodies[1]?.conversationId).toBe(CONV_1);
    expect(bodies[2]).not.toHaveProperty("conversationId");
    expect(session.conversationId).toBe(CONV_2);
  });

  it("not_found without a conversation (bad key) does not retry", async () => {
    const { fetchFn, fn } = mockFetch(err(404, "not_found"));
    const session = createChatSession({ publicKey: KEY, visitorId: VISITOR, fetchFn });
    await expect(session.send("Hi")).resolves.toEqual({ ok: false, error: GENERIC_ERROR });
    expect(fn).toHaveBeenCalledOnce();
  });

  it("retries not_found only once", async () => {
    const { fetchFn, fn } = mockFetch(ok(CONV_1), err(404, "not_found"), err(404, "not_found"));
    const session = createChatSession({ publicKey: KEY, visitorId: VISITOR, fetchFn });
    await session.send("First");
    await expect(session.send("Second")).resolves.toEqual({ ok: false, error: GENERIC_ERROR });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("never sends an empty or over-long message", async () => {
    const { fetchFn, fn } = mockFetch();
    const session = createChatSession({ publicKey: KEY, visitorId: VISITOR, fetchFn });
    await expect(session.send("   ")).resolves.toEqual({ ok: false, error: GENERIC_ERROR });
    await expect(session.send("x".repeat(MAX_CHAT_MESSAGE_CHARS + 1))).resolves.toEqual({ ok: false, error: GENERIC_ERROR });
    expect(fn).not.toHaveBeenCalled();
  });

  it("stores the conversationId per public key, so a reload continues the chat", async () => {
    const storage = memoryStorage();
    const first = mockFetch(ok(CONV_1));
    await createChatSession({ publicKey: KEY, visitorId: VISITOR, fetchFn: first.fetchFn, storage: () => storage }).send("Hi");
    expect(storage.data.get(CONVERSATION_STORAGE_PREFIX + KEY)).toBe(CONV_1);

    const reloaded = mockFetch(ok(CONV_1));
    await createChatSession({ publicKey: KEY, visitorId: VISITOR, fetchFn: reloaded.fetchFn, storage: () => storage }).send("Back");
    expect(reloaded.bodies[0]?.conversationId).toBe(CONV_1);

    const otherProject = mockFetch(ok(CONV_2));
    await createChatSession({ publicKey: "pk_other0000000000000000", visitorId: VISITOR, fetchFn: otherProject.fetchFn, storage: () => storage }).send("Hi");
    expect(otherProject.bodies[0]).not.toHaveProperty("conversationId");
  });

  it("ignores a malformed stored id and clears the stored id on not_found", async () => {
    const bad = memoryStorage({ [CONVERSATION_STORAGE_PREFIX + KEY]: "not-a-uuid" });
    const a = mockFetch(ok(CONV_1));
    await createChatSession({ publicKey: KEY, visitorId: VISITOR, fetchFn: a.fetchFn, storage: () => bad }).send("Hi");
    expect(a.bodies[0]).not.toHaveProperty("conversationId");

    const stale = memoryStorage({ [CONVERSATION_STORAGE_PREFIX + KEY]: CONV_1 });
    const b = mockFetch(err(404, "not_found"), err(500, "internal"));
    await createChatSession({ publicKey: KEY, visitorId: VISITOR, fetchFn: b.fetchFn, storage: () => stale }).send("Hi");
    expect(stale.data.has(CONVERSATION_STORAGE_PREFIX + KEY)).toBe(false);
  });

  it("works when storage throws (blocked third-party storage)", async () => {
    const { fetchFn, bodies } = mockFetch(ok(CONV_1), ok(CONV_1));
    const storage = () => {
      throw new Error("SecurityError");
    };
    const session = createChatSession({ publicKey: KEY, visitorId: VISITOR, fetchFn, storage });
    await session.send("First");
    await session.send("Second");
    expect(bodies[1]?.conversationId).toBe(CONV_1);
  });

  it("never stores a malformed conversationId from a 200", async () => {
    const storage = memoryStorage();
    const { fetchFn, bodies } = mockFetch(json(200, { reply: "Hello", conversationId: "invalid" }), ok(CONV_1));
    const session = createChatSession({ publicKey: KEY, visitorId: VISITOR, fetchFn, storage: () => storage });
    await session.send("First");
    await session.send("Second");
    expect(session.conversationId).toBe(CONV_1);
    expect(bodies[1]).not.toHaveProperty("conversationId");
  });

  describe("request deadline", () => {
    it.each([
      ["the connection stalls", () => new Promise<Response>(() => {})],
      [
        "the response body stalls",
        async () => ({ ok: true, status: 200, json: () => new Promise<unknown>(() => {}) }) as unknown as Response,
      ],
    ])("gives up with the generic message and aborts the request when %s", async (_name, answer) => {
      vi.useFakeTimers();
      try {
        let signal: AbortSignal | undefined;
        const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
          signal = init?.signal ?? undefined;
          return answer();
        }) as unknown as typeof fetch;
        const session = createChatSession({ publicKey: KEY, visitorId: VISITOR, fetchFn });

        const outcome = session.send("Hi");
        await vi.advanceTimersByTimeAsync(CHAT_TIMEOUT_MS - 1);
        expect(signal?.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await expect(outcome).resolves.toEqual({ ok: false, error: GENERIC_ERROR });
        expect(signal?.aborted).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("clears the deadline after a normal reply", async () => {
      vi.useFakeTimers();
      try {
        const { fetchFn } = mockFetch(ok(CONV_1));
        await expect(createChatSession({ publicKey: KEY, visitorId: VISITOR, fetchFn }).send("Hi")).resolves.toMatchObject({ ok: true });
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
