import { describe, expect, it } from "vitest";
import { chatReducer, initialChatState, MOCK_REPLY } from "./chat-state";

describe("chatReducer", () => {
  it("send adds the visitor message and shows typing; reply adds the bot message and stops typing", () => {
    const sent = chatReducer(initialChatState, { type: "send", id: "1", text: "Hi" });
    expect(sent).toEqual({ messages: [{ id: "1", role: "visitor", text: "Hi" }], typing: true });

    const replied = chatReducer(sent, { type: "reply", id: "2", text: MOCK_REPLY });
    expect(replied.typing).toBe(false);
    expect(replied.messages.at(-1)).toEqual({ id: "2", role: "bot", text: MOCK_REPLY });
  });
});
