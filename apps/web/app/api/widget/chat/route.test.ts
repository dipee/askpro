import { PLAN_LIMITS } from "@askwell/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Arcjet, OpenAI and Supabase are mocked. `events` records the order of every
// outside call, so a test can check what did and didn't run.
type Row = Record<string, unknown>;
type DbError = { message: string } | null;

const fake = vi.hoisted(() => {
  const state = {
    events: [] as string[],
    guard: { ok: true } as { ok: true } | { ok: false; reason: "rate_limit" | "injection" },
    projects: [] as Row[],
    conversations: [] as Row[],
    chunks: [] as { project_id: string; id: string; source_id: string; content: string; similarity: number }[],
    messagesUsed: {} as Record<string, number>,
    errors: {} as Partial<Record<"projects" | "conversations" | "consume_message" | "match_chunks" | "save_chat_turn", DbError>>,
    rpcCalls: [] as [string, Row][],
    reply: "We open at 9." as string | Error,
    savedConversationId: "11111111-1111-4111-8111-111111111111",
    lastAnswerInput: undefined as undefined | { chunks: unknown[]; question: string },
  };

  function table(name: "projects" | "conversations") {
    const filters: [string, unknown][] = [];
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => (filters.push([column, value]), builder),
      maybeSingle: async () => {
        state.events.push(`read:${name}`);
        const error = state.errors[name] ?? null;
        if (error) return { data: null, error };
        const rows = name === "projects" ? state.projects : state.conversations;
        const row = rows.find((r) => filters.every(([c, v]) => r[c] === v));
        return { data: row ?? null, error: null };
      },
    };
    return builder;
  }

  async function rpc(fn: string, args: Row) {
    state.events.push(`rpc:${fn}`);
    state.rpcCalls.push([fn, args]);
    const error = state.errors[fn as keyof typeof state.errors] ?? null;
    if (error) return { data: null, error };
    if (fn === "consume_message") {
      const id = args.p_project_id as string;
      const used = state.messagesUsed[id] ?? 0;
      const accepted = used < (args.p_limit as number);
      if (accepted) state.messagesUsed[id] = used + 1;
      return { data: [{ accepted, messages_used: state.messagesUsed[id], message_limit: args.p_limit }], error: null };
    }
    if (fn === "match_chunks") {
      // Same scoping as the real function: this project's chunks only.
      const rows = state.chunks
        .filter((c) => c.project_id === args.p_project_id)
        .slice(0, args.p_count as number)
        .map(({ id, source_id, content, similarity }) => ({ id, source_id, content, similarity }));
      return { data: rows, error: null };
    }
    if (fn === "save_chat_turn") return { data: args.p_conversation_id ?? state.savedConversationId, error: null };
    throw new Error(`unexpected rpc ${fn}`);
  }

  return { state, client: { from: table, rpc } };
});

vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/supabase/service", () => ({ createServiceClient: () => fake.client }));
vi.mock("../../../../lib/arcjet", () => ({
  protectChat: async () => (fake.state.events.push("arcjet"), fake.state.guard),
}));
vi.mock("../../../../lib/ai/openai", () => ({
  embedTexts: async (texts: string[]) => (fake.state.events.push("openai:embed"), texts.map(() => [0.1, 0.2])),
}));
vi.mock("../../../../lib/chat/reply", () => ({
  generateReply: async (chunks: { content: string }[], question: string) => {
    fake.state.events.push("openai:chat");
    fake.state.lastAnswerInput = { chunks, question };
    if (fake.state.reply instanceof Error) throw fake.state.reply;
    return fake.state.reply;
  },
}));
// readJsonBody lives in lib/projects, which imports Clerk; the route never calls it.
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: null }) }));

const { POST, OPTIONS, CHAT_MATCH_COUNT } = await import("./route");

const KEY = "pk_0123456789abcdef0123456789abcdef";
const OTHER_KEY = "pk_fedcba9876543210fedcba9876543210";
const PROJECT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_PROJECT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONVO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_CONVO = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const VISITOR = "visitor_12345";

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("https://askwell.test/api/widget/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const ask = (extra: Row = {}) => post({ key: KEY, visitorId: VISITOR, message: "When do you open?", ...extra });

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect((await res.json()) as unknown).toMatchObject({ error: { code } });
  expect(res.headers.get("access-control-allow-origin")).toBe("*");
  expect(res.headers.get("cache-control")).toBe("no-store");
}

function lastAnswerInput() {
  if (!fake.state.lastAnswerInput) throw new Error("generateReply wasn't called");
  return fake.state.lastAnswerInput;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(fake.state, {
    events: [],
    guard: { ok: true },
    projects: [
      { id: PROJECT, public_key: KEY, accounts: { plan: "free" } },
      { id: OTHER_PROJECT, public_key: OTHER_KEY, accounts: { plan: "pro" } },
    ],
    conversations: [
      { id: CONVO, project_id: PROJECT },
      { id: OTHER_CONVO, project_id: OTHER_PROJECT },
    ],
    chunks: [
      { project_id: OTHER_PROJECT, id: "c-other", source_id: "s-other", content: "Other project's secret.", similarity: 0.99 },
      { project_id: PROJECT, id: "c1", source_id: "s1", content: "We open at 9.", similarity: 0.9 },
      { project_id: PROJECT, id: "c2", source_id: "s1", content: "We fix taps.", similarity: 0.5 },
    ],
    messagesUsed: {},
    errors: {},
    rpcCalls: [],
    reply: "We open at 9.",
    lastAnswerInput: undefined,
  });
});

describe("POST /api/widget/chat", () => {
  it("200: answers, saves the turn and returns the new conversation, in order", async () => {
    const res = await ask();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conversationId: fake.state.savedConversationId, reply: "We open at 9." });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(fake.state.events).toEqual([
      "arcjet",
      "read:projects",
      "rpc:consume_message",
      "openai:embed",
      "rpc:match_chunks",
      "openai:chat",
      "rpc:save_chat_turn",
    ]);
    const save = fake.state.rpcCalls.find(([fn]) => fn === "save_chat_turn")?.[1];
    expect(save).toEqual({
      p_project_id: PROJECT,
      p_visitor_id: VISITOR,
      p_visitor_body: "When do you open?",
      p_bot_body: "We open at 9.",
    });
  });

  it("200: a follow-up with this project's conversationId is checked first and saved to it", async () => {
    const res = await ask({ conversationId: CONVO });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conversationId: CONVO, reply: "We open at 9." });
    expect(fake.state.events.slice(0, 4)).toEqual(["arcjet", "read:projects", "read:conversations", "rpc:consume_message"]);
    const save = fake.state.rpcCalls.find(([fn]) => fn === "save_chat_turn")?.[1];
    expect(save).toMatchObject({ p_conversation_id: CONVO });
  });

  it("retrieval is scoped to the key's project: top 5 of its own chunks only", async () => {
    await ask();
    const match = fake.state.rpcCalls.find(([fn]) => fn === "match_chunks")?.[1];
    expect(match).toEqual({ p_project_id: PROJECT, p_embedding: JSON.stringify([0.1, 0.2]), p_count: 5 });
    expect(CHAT_MATCH_COUNT).toBe(5);
    expect(lastAnswerInput().chunks).toEqual([
      { id: "c1", source_id: "s1", content: "We open at 9.", similarity: 0.9 },
      { id: "c2", source_id: "s1", content: "We fix taps.", similarity: 0.5 },
    ]);
    expect(JSON.stringify(lastAnswerInput())).not.toContain("Other project's secret.");
  });

  it("counts against the plan read on the server, never the request", async () => {
    await post({ key: KEY, visitorId: VISITOR, message: "Hi", plan: "pro" });
    expect(fake.state.rpcCalls.find(([fn]) => fn === "consume_message")?.[1]).toEqual({
      p_project_id: PROJECT,
      p_limit: PLAN_LIMITS.free.messagesPerMonth,
    });
    await post({ key: OTHER_KEY, visitorId: VISITOR, message: "Hi" });
    expect(fake.state.rpcCalls.filter(([fn]) => fn === "consume_message")[1]?.[1]).toEqual({
      p_project_id: OTHER_PROJECT,
      p_limit: PLAN_LIMITS.pro.messagesPerMonth,
    });
  });

  it.each([
    ["a non-JSON body", "not json"],
    ["a missing key", { visitorId: VISITOR, message: "Hi" }],
    ["a bad visitorId", { key: KEY, visitorId: "x", message: "Hi" }],
    ["a bad conversationId", { key: KEY, visitorId: VISITOR, message: "Hi", conversationId: "nope" }],
    ["an empty message", { key: KEY, visitorId: VISITOR, message: "   " }],
    ["a message over 1,000 characters", { key: KEY, visitorId: VISITOR, message: "a".repeat(1001) }],
  ])("400 validation for %s, before Arcjet or the database", async (_, body) => {
    await expectError(await post(body), 400, "validation");
    expect(fake.state.events).toEqual([]);
  });

  it("429 rate_limited: nothing counted, no OpenAI call", async () => {
    fake.state.guard = { ok: false, reason: "rate_limit" };
    await expectError(await ask(), 429, "rate_limited");
    expect(fake.state.events).toEqual(["arcjet"]);
  });

  it("400 message_blocked on prompt injection: nothing counted, no OpenAI call", async () => {
    fake.state.guard = { ok: false, reason: "injection" };
    await expectError(await ask(), 400, "message_blocked");
    expect(fake.state.events).toEqual(["arcjet"]);
  });

  it("404 for an unknown key, nothing counted", async () => {
    await expectError(await post({ key: `pk_${"9".repeat(32)}`, visitorId: VISITOR, message: "Hi" }), 404, "not_found");
    expect(fake.state.events).toEqual(["arcjet", "read:projects"]);
  });

  it("404 for another project's conversationId: messages_used unchanged, no OpenAI call", async () => {
    await expectError(await ask({ conversationId: OTHER_CONVO }), 404, "not_found");
    expect(fake.state.events).toEqual(["arcjet", "read:projects", "read:conversations"]);
    expect(fake.state.messagesUsed).toEqual({});
  });

  it("429 quota_exceeded at the monthly limit, with no OpenAI call", async () => {
    fake.state.messagesUsed[PROJECT] = PLAN_LIMITS.free.messagesPerMonth;
    await expectError(await ask(), 429, "quota_exceeded");
    expect(fake.state.events).toEqual(["arcjet", "read:projects", "rpc:consume_message"]);
    expect(fake.state.messagesUsed[PROJECT]).toBe(PLAN_LIMITS.free.messagesPerMonth);
  });

  it("500 on a model error: the message stays counted, nothing saved", async () => {
    fake.state.reply = new Error("OpenAI 503");
    await expectError(await ask(), 500, "internal");
    expect(fake.state.messagesUsed[PROJECT]).toBe(1);
    expect(fake.state.events).not.toContain("rpc:save_chat_turn");
  });

  it("500 when match_chunks fails, after counting, without a chat call", async () => {
    fake.state.errors.match_chunks = { message: "boom" };
    await expectError(await ask(), 500, "internal");
    expect(fake.state.messagesUsed[PROJECT]).toBe(1);
    expect(fake.state.events).not.toContain("openai:chat");
  });

  it.each(["projects", "conversations", "consume_message"] as const)(
    "500 without leaking the database error when %s fails, and no OpenAI call",
    async (where) => {
      fake.state.errors[where] = { message: "relation does not exist" };
      const res = await ask({ conversationId: CONVO });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: { code: "internal", message: "Something went wrong." } });
      expect(fake.state.events.some((e) => e.startsWith("openai"))).toBe(false);
    },
  );

  it("404 when the conversation disappears before save_chat_turn", async () => {
    fake.state.errors.save_chat_turn = { message: "conversation_not_found" };
    await expectError(await ask({ conversationId: CONVO }), 404, "not_found");
  });

  it("500 on any other save_chat_turn error", async () => {
    fake.state.errors.save_chat_turn = { message: "check violation" };
    await expectError(await ask(), 500, "internal");
  });
});

describe("OPTIONS /api/widget/chat", () => {
  it("answers the CORS preflight for any origin", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });
});
