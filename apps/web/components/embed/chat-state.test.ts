import { afterEach, describe, expect, it, vi } from "vitest";
import { chatReducer, initialChatState, MOCK_REPLY, newMessageId } from "./chat-state";

describe("chatReducer", () => {
  it("send adds the visitor message and shows typing; reply adds the bot message and stops typing", () => {
    const sent = chatReducer(initialChatState, { type: "send", id: "1", text: "Hi" });
    expect(sent).toEqual({ messages: [{ id: "1", role: "visitor", text: "Hi" }], typing: true });

    const replied = chatReducer(sent, { type: "reply", id: "2", text: MOCK_REPLY });
    expect(replied.typing).toBe(false);
    expect(replied.messages.at(-1)).toEqual({ id: "2", role: "bot", text: MOCK_REPLY });
  });
});

describe("newMessageId", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("works when crypto.randomUUID is missing (http host page, not a secure context)", () => {
    vi.stubGlobal("crypto", { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
    expect(globalThis.crypto.randomUUID).toBeUndefined();
    const a = newMessageId();
    const b = newMessageId();
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(b).not.toBe(a);
  });

  it("lets a send go through with randomUUID missing", () => {
    vi.stubGlobal("crypto", { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
    const state = chatReducer(initialChatState, { type: "send", id: newMessageId(), text: "Hi" });
    expect(state.messages).toHaveLength(1);
  });
});
