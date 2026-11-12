/**
 * Most bytes a chat request body may have. A valid body is a public key, a visitor ID,
 * a UUID and at most MAX_CHAT_MESSAGE_CHARS (1,000) characters. Even if every character
 * is JSON-escaped as `\uXXXX` (6 bytes), that stays under 7 KB.
 */
export const MAX_CHAT_BODY_BYTES = 16 * 1024;

export type CappedJson = { ok: true; value: unknown } | { ok: false; reason: "too_large" | "invalid_json" };

/**
 * Reads a JSON body without ever holding more than `maxBytes`: a larger Content-Length
 * is refused unread, and a chunked body is cut off as soon as it passes the cap.
 */
export async function readJsonBodyCapped(request: Request, maxBytes = MAX_CHAT_BODY_BYTES): Promise<CappedJson> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too_large" };
  if (!request.body) return { ok: false, reason: "invalid_json" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}
