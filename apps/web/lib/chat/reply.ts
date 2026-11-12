import "server-only";
import { CHAT_MODEL, openai } from "../ai/openai";
import { buildChatUserMessage, CHAT_SYSTEM_PROMPT, I_DONT_KNOW_REPLY, type ChatExcerpt } from "./prompt";

/** Upper bound on one reply's length, to cap cost per message. */
export const MAX_REPLY_TOKENS = 500;

/**
 * Answers the question from the excerpts with CHAT_MODEL. With no excerpts there is
 * nothing to answer from, so it returns the fixed "I don't know" reply without a
 * model call. Throws on a model error or an empty reply.
 */
export async function generateReply(excerpts: readonly ChatExcerpt[], question: string): Promise<string> {
  if (excerpts.length === 0) return I_DONT_KNOW_REPLY;

  const completion = await openai().chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0,
    max_completion_tokens: MAX_REPLY_TOKENS,
    messages: [
      { role: "system", content: CHAT_SYSTEM_PROMPT },
      { role: "user", content: buildChatUserMessage(excerpts, question) },
    ],
  });
  // Phase 4: PostHog AI trace (model, tokens, cost, latency, project ID).

  const reply = completion.choices[0]?.message.content?.trim();
  if (!reply) throw new Error("The chat model returned an empty reply");
  return reply;
}
