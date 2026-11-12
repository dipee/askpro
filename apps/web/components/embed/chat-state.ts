import type { MessageRole } from "@askwell/shared";
import { newVisitorId } from "./visitor-id";

/**
 * ID for a chat message (React key). Not crypto.randomUUID(): it's missing
 * when an http:// host page frames the panel (not a secure context), which
 * made the first send throw. getRandomValues works everywhere.
 */
export const newMessageId = (): string => newVisitorId();

export type ChatMessage = { id: string; role: MessageRole; text: string };
/** `error` is the friendly notice for the last failed send, shown until the next send. */
export type ChatState = { messages: ChatMessage[]; typing: boolean; error: string | null };
export type ChatAction =
  | { type: "send"; id: string; text: string }
  | { type: "reply"; id: string; text: string }
  | { type: "error"; message: string };

export const initialChatState: ChatState = { messages: [], typing: false, error: null };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "send":
      return {
        messages: [...state.messages, { id: action.id, role: "visitor", text: action.text }],
        typing: true,
        error: null,
      };
    case "reply":
      return {
        messages: [...state.messages, { id: action.id, role: "bot", text: action.text }],
        typing: false,
        error: null,
      };
    case "error":
      return { ...state, typing: false, error: action.message };
  }
}
