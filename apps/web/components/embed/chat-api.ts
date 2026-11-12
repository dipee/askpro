import {
  ERROR_CODES,
  MAX_CHAT_MESSAGE_CHARS,
  type ChatRequest,
  type ChatResponse,
  type ErrorCode,
} from "@askwell/shared";

export const CHAT_PATH = "/api/widget/chat";
export const CONVERSATION_STORAGE_PREFIX = "askwell.conversationId.";

/** What the visitor sees for each failure. Anything not listed gets GENERIC_ERROR. */
export const CHAT_ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
  rate_limited: "You're sending messages too fast. Wait a moment.",
  quota_exceeded: "This chat has reached its message limit for this month.",
  message_blocked: "That message can't be answered.",
};
export const GENERIC_ERROR = "Something went wrong. Please try again.";

export type ChatOutcome = { ok: true; reply: string } | { ok: false; error: string };

type PostResult = { ok: true; data: ChatResponse } | { ok: false; code: ErrorCode | "network" };
type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const isErrorCode = (v: unknown): v is ErrorCode => typeof v === "string" && (ERROR_CODES as readonly string[]).includes(v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One POST to the chat route (same origin as the iframe). Never throws. */
export async function postChat(request: ChatRequest, fetchFn: typeof fetch): Promise<PostResult> {
  try {
    const res = await fetchFn(CHAT_PATH, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(request),
    });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) {
      const b = body as Partial<ChatResponse> | null;
      if (typeof b?.reply === "string" && typeof b.conversationId === "string") {
        return { ok: true, data: { reply: b.reply, conversationId: b.conversationId } };
      }
      return { ok: false, code: "internal" };
    }
    const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
    return { ok: false, code: isErrorCode(code) ? code : "internal" };
  } catch {
    return { ok: false, code: "network" };
  }
}

/**
 * The panel's link to the chat route. Holds the conversation ID returned by
 * the first reply and sends it with every later message. It's also kept in
 * the iframe's localStorage per public key, so a reload continues the same
 * conversation. Storage is optional: if it's missing or throws, the ID lives
 * in memory only.
 */
export function createChatSession({
  publicKey,
  visitorId,
  fetchFn = (...args) => fetch(...args),
  storage = () => null,
}: {
  publicKey: string;
  visitorId: string;
  fetchFn?: typeof fetch;
  storage?: () => KeyValueStorage | null | undefined;
}) {
  const storageKey = CONVERSATION_STORAGE_PREFIX + publicKey;
  const store = (fn: (s: KeyValueStorage) => void) => {
    try {
      const s = storage();
      if (s) fn(s);
    } catch {
      // memory only
    }
  };

  let conversationId: string | undefined;
  store((s) => {
    const saved = s.getItem(storageKey);
    if (saved && UUID.test(saved)) conversationId = saved;
  });

  const setConversation = (id: string | undefined) => {
    conversationId = id;
    store((s) => (id ? s.setItem(storageKey, id) : s.removeItem(storageKey)));
  };

  return {
    get conversationId() {
      return conversationId;
    },
    async send(message: string): Promise<ChatOutcome> {
      const text = message.trim();
      if (!text || text.length > MAX_CHAT_MESSAGE_CHARS) return { ok: false, error: GENERIC_ERROR };
      const post = () =>
        postChat({ key: publicKey, visitorId, message: text, ...(conversationId ? { conversationId } : {}) }, fetchFn);

      let result = await post();
      // The saved conversation is gone (or belongs elsewhere): start a new chat, once.
      if (!result.ok && result.code === "not_found" && conversationId) {
        setConversation(undefined);
        result = await post();
      }
      if (!result.ok) {
        return { ok: false, error: (result.code !== "network" && CHAT_ERROR_MESSAGES[result.code]) || GENERIC_ERROR };
      }
      setConversation(result.data.conversationId);
      return { ok: true, reply: result.data.reply };
    },
  };
}

export type ChatSession = ReturnType<typeof createChatSession>;
