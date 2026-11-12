import { idParamsSchema, type GetConversationResponse } from "@askwell/shared";
import type { NextRequest } from "next/server";
import { errorResponse } from "../../../../lib/api/errors";
import { CONVERSATION_COLUMNS, MESSAGE_COLUMNS, toConversation, toMessage } from "../../../../lib/conversations";
import { currentUserId } from "../../../../lib/projects";
import { createOwnerClient } from "../../../../lib/supabase/owner";

// Owner route: no CORS headers. Owner client only; RLS scopes every read.

const NOT_FOUND = "Conversation not found.";

/**
 * GET /api/conversations/:id: the conversation and all its messages, oldest first.
 * RLS returns nothing for another owner's conversation, so it's a 404 like a missing one.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/conversations/[id]">): Promise<Response> {
  if (!(await currentUserId())) return errorResponse("unauthorized", "Sign in required.");

  const params = idParamsSchema.safeParse(await ctx.params);
  if (!params.success) return errorResponse("validation", "Invalid conversation ID.");

  try {
    const owner = createOwnerClient();
    const { data: conversation, error } = await owner
      .from("conversations")
      .select(CONVERSATION_COLUMNS)
      .eq("id", params.data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!conversation) return errorResponse("not_found", NOT_FOUND);

    // A visitor message and its reply are saved in one transaction with
    // clock_timestamp(), so created_at orders them; id breaks any exact tie.
    const { data: rows, error: messagesError } = await owner
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (messagesError) throw new Error(messagesError.message);

    const body: GetConversationResponse = {
      conversation: toConversation(conversation),
      messages: rows.flatMap((row) => {
        const message = toMessage(row);
        return message ? [message] : [];
      }),
    };
    return Response.json(body);
  } catch (error) {
    console.error("get conversation failed", error instanceof Error ? error.message : error);
    return errorResponse("internal", "Something went wrong.");
  }
}
