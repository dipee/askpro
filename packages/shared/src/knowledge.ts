/** Matches `knowledge_sources.type`. `text` is pasted text; the rest are files. */
export const KNOWLEDGE_SOURCE_TYPES = ["text", "pdf", "md", "txt"] as const;
export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number];

/** Matches `knowledge_sources.status`. */
export const KNOWLEDGE_SOURCE_STATUSES = ["uploading", "processing", "ready", "failed"] as const;
export type KnowledgeSourceStatus = (typeof KNOWLEDGE_SOURCE_STATUSES)[number];

/** File extensions an owner may upload (lowercase, no dot). Each is also its source type. */
export const ALLOWED_UPLOAD_EXTENSIONS = ["pdf", "md", "txt"] as const;
export type UploadExtension = (typeof ALLOWED_UPLOAD_EXTENSIONS)[number];

/** Content type per upload extension (also the bucket's allowed types). */
export const UPLOAD_CONTENT_TYPES = {
  pdf: "application/pdf",
  md: "text/markdown",
  txt: "text/plain",
} as const satisfies Record<UploadExtension, string>;

/** 10 MB, same as the `knowledge` bucket. */
export const MAX_KNOWLEDGE_FILE_BYTES = 10 * 1024 * 1024;

/** Max length of pasted knowledge text. */
export const MAX_KNOWLEDGE_TEXT_CHARS = 100_000;

export const MAX_KNOWLEDGE_TITLE_CHARS = 200;

/** Lowercase extension of a file name, or null if it isn't an allowed upload type. */
export function uploadExtension(fileName: string): UploadExtension | null {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return null;
  const ext = fileName.slice(dot + 1).toLowerCase();
  return (ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext)
    ? (ext as UploadExtension)
    : null;
}
