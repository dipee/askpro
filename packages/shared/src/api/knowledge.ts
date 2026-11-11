import { z } from "zod";
import {
  type KnowledgeSourceStatus,
  type KnowledgeSourceType,
  MAX_KNOWLEDGE_FILE_BYTES,
  MAX_KNOWLEDGE_TEXT_CHARS,
  MAX_KNOWLEDGE_TITLE_CHARS,
  uploadExtension,
} from "../knowledge";

export const knowledgeTitleSchema = z.string().trim().min(1).max(MAX_KNOWLEDGE_TITLE_CHARS);

/** A knowledge source as the owner sees it. */
export interface KnowledgeSource {
  id: string;
  projectId: string;
  title: string;
  type: KnowledgeSourceType;
  status: KnowledgeSourceStatus;
  createdAt: string;
}

// POST /api/projects/:id/knowledge (paste text)
export const createTextKnowledgeSchema = z.object({
  title: knowledgeTitleSchema,
  text: z.string().trim().min(1).max(MAX_KNOWLEDGE_TEXT_CHARS),
});
export type CreateTextKnowledgeRequest = z.infer<typeof createTextKnowledgeSchema>;
export interface CreateTextKnowledgeResponse {
  source: KnowledgeSource;
}

// POST /api/projects/:id/knowledge/upload-url
export const knowledgeUploadUrlSchema = z.object({
  title: knowledgeTitleSchema,
  fileName: z
    .string()
    .min(1)
    .max(255)
    .refine((name) => uploadExtension(name) !== null, "Only PDF, Markdown and TXT files"),
  /** Declared size in bytes. `finalize` checks the real size. */
  size: z.int().min(1).max(MAX_KNOWLEDGE_FILE_BYTES),
});
export type KnowledgeUploadUrlRequest = z.infer<typeof knowledgeUploadUrlSchema>;
export interface KnowledgeUploadUrlResponse {
  /** The reserved source, status `uploading`. */
  source: KnowledgeSource;
  /** One-time signed Storage URL the browser uploads to. */
  uploadUrl: string;
  /** Token for that signed upload. */
  token: string;
}

// POST /api/projects/:id/knowledge/finalize
export const finalizeKnowledgeSchema = z.object({ sourceId: z.uuid() });
export type FinalizeKnowledgeRequest = z.infer<typeof finalizeKnowledgeSchema>;
export interface FinalizeKnowledgeResponse {
  source: KnowledgeSource;
}

// DELETE /api/knowledge/:id → OkResponse
