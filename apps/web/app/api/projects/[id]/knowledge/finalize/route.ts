import {
  finalizeKnowledgeSchema,
  MAX_KNOWLEDGE_FILE_BYTES,
  uploadExtension,
  type FinalizeKnowledgeResponse,
} from "@askwell/shared";
import type { NextRequest } from "next/server";
import { errorResponse } from "../../../../../../lib/api/errors";
import { ExtractError, extractText } from "../../../../../../lib/knowledge/extract";
import { processSource } from "../../../../../../lib/knowledge/process";
import { downloadObject, removeObjects } from "../../../../../../lib/knowledge/storage";
import { readJsonBody } from "../../../../../../lib/projects";
import { createServiceClient } from "../../../../../../lib/supabase/service";
import { gateOwnedProject, INTERNAL, isResponse, SOURCE_COLUMNS, sourceFromRow } from "../shared";

// Owner route: no CORS headers. Download, extraction and embedding run inline; files are
// at most 10 MB.
export const maxDuration = 60;

const MAX_MB = MAX_KNOWLEDGE_FILE_BYTES / (1024 * 1024);
/** Every PDF starts with these bytes. */
const PDF_MAGIC = new TextEncoder().encode("%PDF-");

/**
 * POST /api/projects/:id/knowledge/finalize: after the browser uploaded the file, claims
 * the source once (`uploading` → `processing`), checks the real file, then processes it.
 * A refused file is deleted with its source (400). Otherwise 200 with the source,
 * `ready` or `failed`.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/knowledge/finalize">,
): Promise<Response> {
  const gate = await gateOwnedProject(ctx.params);
  if (isResponse(gate)) return gate;
  const { projectId } = gate;

  const input = finalizeKnowledgeSchema.safeParse(await readJsonBody(request));
  if (!input.success) return errorResponse("validation", "Invalid source ID.");
  const sourceId = input.data.sourceId;

  const db = createServiceClient();
  // The claim: only one call can move this row out of `uploading`. A second call, a
  // pasted-text source or another project's source matches nothing.
  const { data: row, error: claimError } = await db
    .from("knowledge_sources")
    .update({ status: "processing" })
    .eq("id", sourceId)
    .eq("project_id", projectId)
    .eq("status", "uploading")
    .select(`${SOURCE_COLUMNS}, storage_key`)
    .maybeSingle();
  if (claimError) {
    console.error("knowledge finalize claim failed", { sourceId, error: claimError.message });
    return INTERNAL();
  }
  if (!row) return errorResponse("not_found", "Upload not found, or it was already finished.");
  const source = sourceFromRow(row);
  const key = row.storage_key;
  if (!key) return INTERNAL(); // the table's CHECK makes this impossible for a file

  /** Refuses the file: deletes it and its source, so it no longer counts toward the limit. */
  const refuse = async (message: string): Promise<Response> => {
    const { error } = await db.from("knowledge_sources").delete().eq("id", sourceId).eq("project_id", projectId);
    if (error) console.error("knowledge finalize: deleting refused source failed", { sourceId, error: error.message });
    await removeObjects([key], "refused upload");
    return errorResponse("validation", message);
  };

  /** An unexpected error after the claim: the source becomes `failed`; the owner can delete it. */
  const markFailed = async (): Promise<Response> => {
    const { error } = await db
      .from("knowledge_sources")
      .update({ status: "failed" })
      .eq("id", sourceId)
      .eq("project_id", projectId);
    if (error) console.error("knowledge finalize: setting status failed didn't work", { sourceId, error: error.message });
    return INTERNAL();
  };

  let bytes: Uint8Array | null;
  try {
    bytes = await downloadObject(key);
  } catch (error) {
    console.error("knowledge finalize download failed", { sourceId, error: error instanceof Error ? error.message : error });
    return markFailed();
  }
  if (!bytes) return refuse("The file didn't finish uploading. Please upload it again.");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_KNOWLEDGE_FILE_BYTES) {
    return refuse(`Files must be between 1 byte and ${MAX_MB} MB.`);
  }

  const ext = uploadExtension(key);
  if (!ext || ext !== source.type) return INTERNAL(); // keys are built from the type
  if (ext === "pdf" && !startsWith(bytes, PDF_MAGIC)) return refuse("This file isn't a valid PDF.");

  let text: string;
  try {
    text = await extractText(bytes, ext);
  } catch (error) {
    if (error instanceof ExtractError) return refuse(error.message);
    console.error("knowledge finalize extract failed", { sourceId, error: error instanceof Error ? error.message : error });
    return markFailed();
  }

  const result = await processSource({ projectId, sourceId, text });
  const body: FinalizeKnowledgeResponse = { source: { ...source, status: result.status } };
  return Response.json(body);
}

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  return bytes.byteLength >= prefix.byteLength && prefix.every((b, i) => bytes[i] === b);
}
