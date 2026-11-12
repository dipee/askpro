import { z } from "zod";
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

// GET /api/projects/:id/conversations?limit=&offset= query
/** Paging: limit 1..100 (default 50), offset >= 0 (default 0); the bounds owner_activity enforces. */
export const listConversationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;

// GET /api/projects/:id/conversations (newest first)
export interface ListConversationsResponse {
  conversations: ConversationSummary[];
}

// GET /api/conversations/:id (messages oldest first)
export interface GetConversationResponse {
  conversation: Conversation;
  messages: Message[];
}
