import "server-only";
import arcjet, { detectPromptInjection, fixedWindow } from "@arcjet/next";
import { required } from "./supabase/env";

/** Chat messages allowed per public key + client IP per minute (project.md §6.6). */
export const CHAT_RATE_LIMIT = 20;

export type ChatGuardResult = { ok: true } | { ok: false; reason: "rate_limit" | "injection" };

function createChatGuard() {
  return arcjet({
    key: required(process.env.ARCJET_KEY, "ARCJET_KEY"),
    rules: [
      // Fixed window per route + public key + client IP (project.md §3). The IP is the
      // one Arcjet detects itself, never a client-sent header.
      fixedWindow({
        mode: "LIVE",
        characteristics: ["http.request.uri.path", "publicKey", "ip.src"],
        window: 60,
        max: CHAT_RATE_LIMIT,
      }),
      detectPromptInjection({ mode: "LIVE" }),
    ],
  });
}

let guard: ReturnType<typeof createChatGuard> | undefined;

/**
 * Step 1 of the chat route: rate limit + prompt-injection check, before any
 * counting or OpenAI call. Call it once per request.
 *
 * Fails open (project.md §3): an errored decision (the SDK turns a Decide API timeout
 * into one) or a thrown error is logged and the request is allowed.
 */
export async function protectChat(
  req: Request,
  { publicKey, message }: { publicKey: string; message: string },
): Promise<ChatGuardResult> {
  guard ??= createChatGuard();
  let decision: Awaited<ReturnType<typeof guard.protect>>;
  try {
    decision = await guard.protect(req, { publicKey, detectPromptInjectionMessage: message });
  } catch (error) {
    console.warn("[arcjet] chat guard threw, allowing:", error instanceof Error ? error.message : error);
    return { ok: true };
  }
  if (decision.isErrored()) {
    console.warn("[arcjet] chat guard errored, allowing:", decision.reason.message);
    return { ok: true };
  }
  if (!decision.isDenied()) return { ok: true };
  // Only two LIVE rules exist, so a deny that isn't the rate limit is the injection check.
  return { ok: false, reason: decision.reason.isRateLimit() ? "rate_limit" : "injection" };
}
