import type { MessageRole } from "@askwell/shared";

/** Phase 2 stand-in. The chat route (Phase 3) replaces it. */
export const MOCK_REPLY = "Thanks! Real answers arrive soon.";
/** How long the typing state shows before the mock reply. */
export const MOCK_REPLY_DELAY_MS = 800;

export type ChatMessage = { id: string; role: MessageRole; text: string };
export type ChatState = { messages: ChatMessage[]; typing: boolean };
export type ChatAction =
  | { type: "send"; id: string; text: string }
  | { type: "reply"; id: string; text: string };

export const initialChatState: ChatState = { messages: [], typing: false };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "send":
      return {
        messages: [...state.messages, { id: action.id, role: "visitor", text: action.text }],
        typing: true,
      };
    case "reply":
      return {
        messages: [...state.messages, { id: action.id, role: "bot", text: action.text }],
        typing: false,
      };
  }
}
