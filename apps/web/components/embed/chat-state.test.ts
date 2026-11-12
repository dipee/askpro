import { afterEach, describe, expect, it, vi } from "vitest";
import { chatReducer, initialChatState, newMessageId } from "./chat-state";

describe("chatReducer", () => {
  it("send adds the visitor message and shows typing; reply adds the bot message and stops typing", () => {
    const sent = chatReducer(initialChatState, { type: "send", id: "1", text: "Hi" });
    expect(sent).toEqual({ messages: [{ id: "1", role: "visitor", text: "Hi" }], typing: true, error: null });

    const replied = chatReducer(sent, { type: "reply", id: "2", text: "Hello!" });
    expect(replied.typing).toBe(false);
    expect(replied.messages.at(-1)).toEqual({ id: "2", role: "bot", text: "Hello!" });
  });

  it("error stops typing, keeps the messages and shows the notice until the next send", () => {
    const sent = chatReducer(initialChatState, { type: "send", id: "1", text: "Hi" });
    const failed = chatReducer(sent, { type: "error", message: "Too fast" });
    expect(failed).toEqual({ messages: sent.messages, typing: false, error: "Too fast" });
    expect(chatReducer(failed, { type: "send", id: "2", text: "Again" }).error).toBeNull();
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
