import "server-only";
import type { UploadExtension } from "@askwell/shared";
import { extractText as extractPdfText } from "unpdf";

/** Thrown when a file can't be read or holds no text. Its message is safe to show the owner. */
export class ExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractError";
  }
}

/**
 * Turns an uploaded file's bytes into plain text. PDF via `unpdf`; md and txt are
 * decoded as UTF-8 (invalid UTF-8 is rejected). NUL characters are removed because
 * Postgres `text` can't store them. Throws ExtractError if the result is empty.
 */
export async function extractText(bytes: Uint8Array, type: UploadExtension): Promise<string> {
  const raw = type === "pdf" ? await extractPdf(bytes) : decodeUtf8(bytes);
  const text = raw.replaceAll("\u0000", "").trim();
  if (!text) throw new ExtractError("The file has no text we can read.");
  return text;
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  try {
    // unpdf may detach the buffer it's given, so pass a copy.
    const { text } = await extractPdfText(bytes.slice(), { mergePages: true });
    return text;
  } catch {
    throw new ExtractError("The PDF could not be read.");
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    // Strips a leading BOM by default.
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ExtractError("The file is not valid UTF-8 text.");
  }
}
