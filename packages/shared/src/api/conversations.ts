import type { MessageRole } from "../messages";

/** One row in a project's conversation list. */
export interface ConversationSummary {
  id: string;
  visitorId: string;
  createdAt: string;
  /** First visitor message, shortened. Null if the conversation has no messages. */
  preview: string | null;
  messageCount: number;
}

export interface Message {
  id: string;
  role: MessageRole;
  body: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  projectId: string;
  visitorId: string;
  createdAt: string;
}

// GET /api/projects/:id/conversations (newest first)
export interface ListConversationsResponse {
  conversations: ConversationSummary[];
}

// GET /api/conversations/:id (messages oldest first)
export interface GetConversationResponse {
  conversation: Conversation;
  messages: Message[];
}
