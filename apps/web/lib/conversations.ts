import type { Database } from "@askwell/db";
import { MESSAGE_ROLES, type Conversation, type ConversationSummary, type Message, type MessageRole } from "@askwell/shared";

/** The query params as a plain object; a param given twice uses the first value. */
export function queryObject(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of params) if (!(key in out)) out[key] = value;
  return out;
}

type ActivityRow = Database["public"]["Functions"]["owner_activity"]["Returns"][number];

/**
 * An owner_activity row as a ConversationSummary. The generated type says `preview` is a
 * string, but the function returns null when there's no visitor message.
 */
export function toConversationSummary(row: ActivityRow): ConversationSummary {
  const preview: string | null = (row.preview as string | null) ?? null;
  return {
    id: row.id,
    visitorId: row.visitor_id,
    createdAt: row.created_at,
    preview,
    messageCount: row.message_count,
  };
}

/** The `conversations` columns the thread route reads. */
export const CONVERSATION_COLUMNS = "id, project_id, visitor_id, created_at";
/** The `messages` columns the thread route reads. */
export const MESSAGE_COLUMNS = "id, role, body, created_at";

type ConversationRow = Pick<
  Database["public"]["Tables"]["conversations"]["Row"],
  "id" | "project_id" | "visitor_id" | "created_at"
>;
type MessageRow = Pick<Database["public"]["Tables"]["messages"]["Row"], "id" | "role" | "body" | "created_at">;

export function toConversation(row: ConversationRow): Conversation {
  return { id: row.id, projectId: row.project_id, visitorId: row.visitor_id, createdAt: row.created_at };
}

const isMessageRole = (role: string): role is MessageRole => (MESSAGE_ROLES as readonly string[]).includes(role);

/** A `messages` row as a Message. Null for a role outside MESSAGE_ROLES (the table's check forbids it). */
export function toMessage(row: MessageRow): Message | null {
  if (!isMessageRole(row.role)) return null;
  return { id: row.id, role: row.role, body: row.body, createdAt: row.created_at };
}
