import {
  KNOWLEDGE_SOURCE_STATUSES,
  KNOWLEDGE_SOURCE_TYPES,
  MAX_KNOWLEDGE_FILE_BYTES,
  MAX_KNOWLEDGE_TEXT_CHARS,
  MAX_KNOWLEDGE_TITLE_CHARS,
  PLAN_LIMITS,
  uploadExtension,
  type KnowledgeSource,
  type KnowledgeSourceStatus,
  type KnowledgeSourceType,
  type Plan,
  type UploadExtension,
} from "@askwell/shared";

// Pure helpers for the Knowledge page: labels and browser-side checks. The browser
// checks are for UX only; the API checks everything again (project.md §9).

export const MAX_FILE_MB = MAX_KNOWLEDGE_FILE_BYTES / (1024 * 1024);
/** For <input type="file" accept>. */
export const FILE_ACCEPT = ".pdf,.md,.txt,application/pdf,text/markdown,text/plain";

/** The row the page reads from `knowledge_sources` (no storage_key). */
export type SourceRow = {
  id: string;
  project_id: string;
  title: string;
  type: string;
  status: string;
  created_at: string;
};

/** A `knowledge_sources` row as the shared `KnowledgeSource`, or null if a value is unknown. */
export function toKnowledgeSource(row: SourceRow): KnowledgeSource | null {
  const type = KNOWLEDGE_SOURCE_TYPES.find((t) => t === row.type);
  const status = KNOWLEDGE_SOURCE_STATUSES.find((s) => s === row.status);
  if (!type || !status) return null;
  return { id: row.id, projectId: row.project_id, title: row.title, type, status, createdAt: row.created_at };
}

/** What the owner sees for each status. `uploading` shows as Processing (project.md §6.4). */
export type StatusLabel = "Processing" | "Ready" | "Failed";
export function statusLabel(status: KnowledgeSourceStatus): StatusLabel {
  if (status === "ready") return "Ready";
  if (status === "failed") return "Failed";
  return "Processing";
}

/** Still being uploaded or processed: the list keeps refreshing while any source is. */
export function isSettling(status: KnowledgeSourceStatus): boolean {
  return status === "uploading" || status === "processing";
}

const TYPE_LABELS: Record<KnowledgeSourceType, string> = { text: "Text", pdf: "PDF", md: "Markdown", txt: "TXT" };
export function typeLabel(type: KnowledgeSourceType): string {
  return TYPE_LABELS[type];
}

export function sourceLimit(plan: Plan): number {
  return PLAN_LIMITS[plan].knowledgeSources;
}

/** "2 of 3 sources used". */
export function usageText(used: number, plan: Plan): string {
  return `${used} of ${sourceLimit(plan)} sources used`;
}

/** Shown at the limit, instead of the add buttons working. */
export function limitHint(plan: Plan): string {
  return plan === "free"
    ? `Free includes ${PLAN_LIMITS.free.knowledgeSources} sources per project. Upgrade to Pro for ${PLAN_LIMITS.pro.knowledgeSources}, or delete one.`
    : "You've used every source on your plan. Delete one to add another.";
}

/** The paste form's problem, or null if it can be sent. Mirrors createTextKnowledgeSchema. */
export function pasteError(title: string, text: string): string | null {
  if (title.trim() === "") return "Give the text a title.";
  if (title.trim().length > MAX_KNOWLEDGE_TITLE_CHARS) return `Keep the title under ${MAX_KNOWLEDGE_TITLE_CHARS + 1} characters.`;
  if (text.trim() === "") return "Paste some text.";
  if (text.trim().length > MAX_KNOWLEDGE_TEXT_CHARS) {
    return `Text can be up to ${MAX_KNOWLEDGE_TEXT_CHARS.toLocaleString("en")} characters. Split it into several sources.`;
  }
  return null;
}

export type FileCheck = { ok: true; ext: UploadExtension } | { ok: false; message: string };

/** Whether a picked file may be uploaded: type by extension, size up to 10 MB. */
export function checkFile(file: { name: string; size: number }): FileCheck {
  const ext = uploadExtension(file.name);
  if (!ext) return { ok: false, message: "Only PDF, Markdown (.md) and TXT files can be uploaded." };
  if (file.size === 0) return { ok: false, message: "This file is empty." };
  if (file.size > MAX_KNOWLEDGE_FILE_BYTES) {
    return { ok: false, message: `This file is ${formatSize(file.size)}. Files can be up to ${MAX_FILE_MB} MB.` };
  }
  return { ok: true, ext };
}

/** The upload form's problem, or null. */
export function uploadError(title: string, file: { name: string; size: number } | null): string | null {
  if (!file) return "Choose a file.";
  const check = checkFile(file);
  if (!check.ok) return check.message;
  if (title.trim() === "") return "Give the file a title.";
  if (title.trim().length > MAX_KNOWLEDGE_TITLE_CHARS) return `Keep the title under ${MAX_KNOWLEDGE_TITLE_CHARS + 1} characters.`;
  return null;
}

/** A default title from a file name: "Refund policy.pdf" → "Refund policy". */
export function titleFromFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  return (dot > 0 ? name.slice(0, dot) : name).trim().slice(0, MAX_KNOWLEDGE_TITLE_CHARS);
}

/** "2.4 MB", "830 KB". */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
