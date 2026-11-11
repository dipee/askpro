import { z } from "zod";

/**
 * postMessage contract between the panel (`/embed`, inside the iframe) and the
 * loader (`widget.js`, on the customer's page). project.md §6.5, §9 postMessage.
 *
 * Every message has a namespaced `type` so the loader can tell ours apart from
 * other scripts' messages on the same page. The namespace is a wire-protocol
 * ID, not the display name: it must not change if the app is renamed, because
 * already-installed loaders depend on it.
 *
 * Senders must pass the other side's exact origin as targetOrigin (never "*").
 * Receivers must check `event.origin` and validate `event.data` with
 * `parseEmbedMessage` before acting on it.
 */
export const EMBED_MESSAGE_NAMESPACE = "askwell";

export const EMBED_MESSAGE_TYPES = {
  /** Panel → loader: the visitor closed the panel. */
  close: `${EMBED_MESSAGE_NAMESPACE}:close`,
  /** Panel → loader: the panel wants this iframe height (CSS px). */
  resize: `${EMBED_MESSAGE_NAMESPACE}:resize`,
  /** Panel → loader: unread bot replies to show on the button. */
  unread: `${EMBED_MESSAGE_NAMESPACE}:unread`,
} as const;

/** Largest iframe height the panel may ask for. */
export const MAX_EMBED_HEIGHT_PX = 2000;
/** Largest unread count the panel reports (the button shows "99+" above 99). */
export const MAX_EMBED_UNREAD = 999;

export const embedCloseMessageSchema = z.strictObject({
  type: z.literal(EMBED_MESSAGE_TYPES.close),
});
export const embedResizeMessageSchema = z.strictObject({
  type: z.literal(EMBED_MESSAGE_TYPES.resize),
  height: z.number().int().min(1).max(MAX_EMBED_HEIGHT_PX),
});
export const embedUnreadMessageSchema = z.strictObject({
  type: z.literal(EMBED_MESSAGE_TYPES.unread),
  count: z.number().int().min(0).max(MAX_EMBED_UNREAD),
});

/** Any message the panel sends to the loader. */
export const embedMessageSchema = z.discriminatedUnion("type", [
  embedCloseMessageSchema,
  embedResizeMessageSchema,
  embedUnreadMessageSchema,
]);

export type EmbedCloseMessage = z.infer<typeof embedCloseMessageSchema>;
export type EmbedResizeMessage = z.infer<typeof embedResizeMessageSchema>;
export type EmbedUnreadMessage = z.infer<typeof embedUnreadMessageSchema>;
export type EmbedMessage = z.infer<typeof embedMessageSchema>;

/** Returns the message if `data` is a valid embed message, else null. Never throws. */
export function parseEmbedMessage(data: unknown): EmbedMessage | null {
  const result = embedMessageSchema.safeParse(data);
  return result.success ? result.data : null;
}

/** Type guard form of `parseEmbedMessage`. */
export function isEmbedMessage(data: unknown): data is EmbedMessage {
  return embedMessageSchema.safeParse(data).success;
}
