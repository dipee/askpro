import { parseEmbedMessage, type EmbedMessage } from "@askwell/shared";

/**
 * The host page's origin from the `origin` query param, or null if it isn't a
 * plain http(s) origin (no path, query or credentials). project.md §9 postMessage.
 */
export function parseParentOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return value.replace(/\/$/, "") === url.origin ? url.origin : null;
}

type MessageTarget = { postMessage: (message: EmbedMessage, targetOrigin: string) => void };

/**
 * Posts `message` to the loader with targetOrigin = the host page's origin.
 * Never uses "*". Returns false (and sends nothing) without a valid origin or parent.
 */
export function postToParent(
  target: MessageTarget | null | undefined,
  parentOrigin: string | null,
  message: EmbedMessage,
): boolean {
  if (!target || !parentOrigin) return false;
  target.postMessage(message, parentOrigin);
  return true;
}

/**
 * Builds a `message` event listener that ignores everything not sent by the
 * host page's origin, and anything that isn't a valid embed message.
 */
export function createParentMessageHandler(
  parentOrigin: string | null,
  onMessage: (message: EmbedMessage) => void,
): (event: Pick<MessageEvent, "origin" | "data">) => void {
  return (event) => {
    if (!parentOrigin || event.origin !== parentOrigin) return;
    const message = parseEmbedMessage(event.data);
    if (message) onMessage(message);
  };
}
