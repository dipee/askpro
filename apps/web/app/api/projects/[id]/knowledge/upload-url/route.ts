import {
  knowledgeUploadUrlSchema,
  MAX_KNOWLEDGE_FILE_BYTES,
  MAX_KNOWLEDGE_TITLE_CHARS,
  uploadExtension,
  type KnowledgeUploadUrlResponse,
} from "@askwell/shared";
import type { NextRequest } from "next/server";
import { errorResponse } from "../../../../../../lib/api/errors";
import { createUploadUrl, newStorageKey } from "../../../../../../lib/knowledge/storage";
import { readJsonBody } from "../../../../../../lib/projects";
import { createServiceClient } from "../../../../../../lib/supabase/service";
import { gateOwnedProject, INTERNAL, isResponse, reserveSource } from "../shared";

// Owner route: no CORS headers.

const MAX_MB = MAX_KNOWLEDGE_FILE_BYTES / (1024 * 1024);

/**
 * POST /api/projects/:id/knowledge/upload-url: checks the declared file name and size,
 * reserves an `uploading` source (counts toward the limit), and returns a one-time
 * signed URL the browser uploads the file to. `finalize` checks the real file.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/knowledge/upload-url">,
): Promise<Response> {
  const gate = await gateOwnedProject(ctx.params);
  if (isResponse(gate)) return gate;

  const input = knowledgeUploadUrlSchema.safeParse(await readJsonBody(request));
  const ext = input.success ? uploadExtension(input.data.fileName) : null;
  if (!input.success || !ext) {
    return errorResponse(
      "validation",
      `Upload a PDF, Markdown or TXT file up to ${MAX_MB} MB, with a title (1–${MAX_KNOWLEDGE_TITLE_CHARS} characters).`,
    );
  }

  const storageKey = newStorageKey(gate.projectId, ext);
  const source = await reserveSource({ ...gate, type: ext, title: input.data.title, storageKey });
  if (isResponse(source)) return source;

  let upload: { uploadUrl: string; token: string };
  try {
    upload = await createUploadUrl(storageKey);
  } catch (error) {
    console.error("knowledge upload-url failed", error instanceof Error ? error.message : error);
    // Free the reservation so it doesn't count toward the limit.
    const { error: undoError } = await createServiceClient()
      .from("knowledge_sources")
      .delete()
      .eq("id", source.id)
      .eq("project_id", gate.projectId);
    if (undoError) console.error("knowledge upload-url undo failed", { sourceId: source.id, error: undoError.message });
    return INTERNAL();
  }

  const body: KnowledgeUploadUrlResponse = { source, ...upload };
  return Response.json(body, { status: 201 });
}
