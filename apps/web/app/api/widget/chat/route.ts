import { chatRequestSchema, planSchema, PLAN_LIMITS, type ChatResponse, type ErrorCode } from "@askwell/shared";
import { embedTexts } from "../../../../lib/ai/openai";
import { publicCorsHeaders, publicPreflight } from "../../../../lib/api/cors";
import { errorResponse } from "../../../../lib/api/errors";
import { protectChat } from "../../../../lib/arcjet";
import { readJsonBodyCapped } from "../../../../lib/chat/body";
import { generateReply } from "../../../../lib/chat/reply";
import { createServiceClient } from "../../../../lib/supabase/service";

// Public: the /embed panel calls this from inside the widget iframe (project.md §6.6, §8).

/** Chunks retrieved per question (project.md §6.6 step 4). */
export const CHAT_MATCH_COUNT = 5;

const HEADERS = { ...publicCorsHeaders(["POST"]), "Cache-Control": "no-store" };

function fail(code: ErrorCode, message: string): Response {
  return errorResponse(code, message, HEADERS);
}

function internal(what: string, error: unknown): Response {
  console.error(`widget chat: ${what}`, error instanceof Error ? error.message : error);
  return fail("internal", "Something went wrong.");
}

export function OPTIONS(): Response {
  return publicPreflight(["POST"]);
}

export async function POST(request: Request): Promise<Response> {
  // 1. Validate. The body is read under a byte cap before parsing, so an oversized
  // request costs no parsing (it runs before the rate limit).
  const raw = await readJsonBodyCapped(request);
  if (!raw.ok && raw.reason === "too_large") return fail("validation", "This message is too long.");
  const input = chatRequestSchema.safeParse(raw.ok ? raw.value : undefined);
  if (!input.success) return fail("validation", "Invalid chat message.");
  const { key, visitorId, conversationId, message } = input.data;

  // 2. Protect: rate limit + prompt injection, before anything is counted or sent to OpenAI.
  const guard = await protectChat(request, { publicKey: key, message });
  if (!guard.ok) {
    // Phase 4: PostHog message_blocked event (reason: guard.reason).
    return guard.reason === "rate_limit"
      ? fail("rate_limited", "Too many messages. Please wait a minute and try again.")
      : fail("message_blocked", "This message can't be sent.");
  }

  // 3. Resolve the project from its public key only. Service client: visitors have no
  // Supabase key, and the key is the only thing that identifies the project.
  const db = createServiceClient();
  const project = await db.from("projects").select("id, accounts(plan)").eq("public_key", key).maybeSingle();
  if (project.error) return internal("reading the project failed", project.error.message);
  if (!project.data) return fail("not_found", "Unknown widget key.");
  const projectId = project.data.id;

  // A given conversation must be this project's and this visitor's, checked before
  // anything is counted. A conversation's project and visitor never change, so
  // save_chat_turn below writes to the conversation checked here.
  if (conversationId) {
    const conversation = await db
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("project_id", projectId)
      .eq("visitor_id", visitorId)
      .maybeSingle();
    if (conversation.error) return internal("reading the conversation failed", conversation.error.message);
    if (!conversation.data) return fail("not_found", "Conversation not found.");
  }

  // 4. Count, with the plan read on the server (project.md §5). Refused → no OpenAI call.
  const plan = planSchema.catch("free").parse(project.data.accounts?.plan);
  const quota = await db.rpc("consume_message", {
    p_project_id: projectId,
    p_limit: PLAN_LIMITS[plan].messagesPerMonth,
  });
  if (quota.error) return internal("consume_message failed", quota.error.message);
  if (!quota.data[0]?.accepted) {
    return fail("quota_exceeded", "This assistant has reached its message limit for this month.");
  }

  // From here the message is counted. A failure below doesn't refund it (project.md §6.6).
  let reply: string;
  try {
    // 5. Retrieve: this project's chunks only.
    const [embedding] = await embedTexts([message]);
    const chunks = await db.rpc("match_chunks", {
      p_project_id: projectId,
      p_embedding: JSON.stringify(embedding),
      p_count: CHAT_MATCH_COUNT,
    });
    if (chunks.error) throw new Error(`match_chunks failed: ${chunks.error.message}`);

    // 6. Answer.
    reply = await generateReply(chunks.data, message);
  } catch (error) {
    return internal("answering failed", error);
  }

  // 7. Save the turn; creates the conversation on the first message.
  const saved = await db.rpc("save_chat_turn", {
    p_project_id: projectId,
    p_visitor_id: visitorId,
    p_visitor_body: message,
    p_bot_body: reply,
    ...(conversationId ? { p_conversation_id: conversationId } : {}),
  });
  if (saved.error) {
    // Deleted between the check above and now.
    if (saved.error.message === "conversation_not_found") return fail("not_found", "Conversation not found.");
    return internal("save_chat_turn failed", saved.error.message);
  }

  const body: ChatResponse = { conversationId: saved.data, reply };
  return Response.json(body, { headers: HEADERS });
}
