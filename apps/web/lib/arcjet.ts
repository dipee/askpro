import "server-only";
import arcjet, { detectPromptInjection, slidingWindow } from "@arcjet/next";
import { required } from "./supabase/env";

/** Chat messages allowed per public key + client IP per minute (project.md §6.6). */
export const CHAT_RATE_LIMIT = 20;

export type ChatGuardResult = { ok: true } | { ok: false; reason: "rate_limit" | "injection" };

function createChatGuard() {
  return arcjet({
    key: required(process.env.ARCJET_KEY, "ARCJET_KEY"),
    // Keyed on the project's public key and the client IP Arcjet detects itself.
    // Never on a client-sent header.
    characteristics: ["publicKey", "ip.src"],
    rules: [
      slidingWindow({ mode: "LIVE", interval: 60, max: CHAT_RATE_LIMIT }),
      detectPromptInjection({ mode: "LIVE" }),
    ],
  });
}

let guard: ReturnType<typeof createChatGuard> | undefined;

/**
 * Step 1 of the chat route: rate limit + prompt-injection check, before any
 * counting or OpenAI call. Call it once per request. Arcjet fails open: an
 * errored decision is logged and allowed.
 */
export async function protectChat(
  req: Request,
  { publicKey, message }: { publicKey: string; message: string },
): Promise<ChatGuardResult> {
  guard ??= createChatGuard();
  const decision = await guard.protect(req, { publicKey, detectPromptInjectionMessage: message });
  if (decision.isErrored()) {
    console.warn("[arcjet] chat guard errored, allowing:", decision.reason.message);
    return { ok: true };
  }
  if (!decision.isDenied()) return { ok: true };
  // Only two LIVE rules exist, so a deny that isn't the rate limit is the injection check.
  return { ok: false, reason: decision.reason.isRateLimit() ? "rate_limit" : "injection" };
}
