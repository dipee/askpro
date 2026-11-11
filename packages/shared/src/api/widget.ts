import { z } from "zod";
import { MAX_CHAT_MESSAGE_CHARS } from "../messages";
import type { WidgetConfig } from "../widget";
import { publicKeySchema } from "./common";

// GET /api/widget/config?key=pk_...
export const widgetConfigQuerySchema = z.object({ key: publicKeySchema });
export type WidgetConfigQuery = z.infer<typeof widgetConfigQuerySchema>;
/** Config with the plan applied: Free gets the defaults and the badge. */
export interface WidgetConfigResponse {
  config: WidgetConfig;
}

/** Random ID the panel keeps in the iframe's localStorage. */
export const visitorIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "Invalid visitor ID");

// POST /api/widget/chat
export const chatRequestSchema = z.object({
  key: publicKeySchema,
  visitorId: visitorIdSchema,
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(1).max(MAX_CHAT_MESSAGE_CHARS),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export interface ChatResponse {
  conversationId: string;
  reply: string;
}
