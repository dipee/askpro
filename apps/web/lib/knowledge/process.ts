import "server-only";
import { embedTexts } from "../ai/openai";
import { createServiceClient } from "../supabase/service";
import { chunkText } from "./chunk";

/** Rows per knowledge_chunks insert. Each row carries a 1,536-float vector (~30 KB as JSON). */
export const CHUNK_INSERT_BATCH_SIZE = 100;

export type ProcessSourceInput = { projectId: string; sourceId: string; text: string };
export type ProcessSourceResult = { status: "ready"; chunkCount: number } | { status: "failed" };

/**
 * Chunks a source's text, embeds the chunks, stores them in knowledge_chunks and
 * marks the source `ready`. On any error it deletes the source's chunks and marks
 * it `failed`. Never throws.
 *
 * Uses the service client: call it only after the route has checked that the owner
 * owns the project (project.md §9).
 */
export async function processSource({ projectId, sourceId, text }: ProcessSourceInput): Promise<ProcessSourceResult> {
  // Created inside the try: a missing env var must still return `failed`, not reject.
  let db: ServiceClient | undefined;
  try {
    db = createServiceClient();
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error("Source has no text to chunk");

    const vectors = await embedTexts(chunks);
    if (vectors.length !== chunks.length) {
      throw new Error(`Expected ${chunks.length} embeddings, got ${vectors.length}`);
    }

    for (let i = 0; i < chunks.length; i += CHUNK_INSERT_BATCH_SIZE) {
      const rows = chunks.slice(i, i + CHUNK_INSERT_BATCH_SIZE).map((content, j) => ({
        project_id: projectId,
        source_id: sourceId,
        content,
        // pgvector reads the '[1,2,3]' text form.
        embedding: JSON.stringify(vectors[i + j]),
      }));
      const { error } = await db.from("knowledge_chunks").insert(rows);
      if (error) throw error;
    }

    const { data, error } = await db
      .from("knowledge_sources")
      .update({ status: "ready" })
      .eq("id", sourceId)
      .eq("project_id", projectId)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Source not found");

    return { status: "ready", chunkCount: chunks.length };
  } catch (err) {
    console.error("Knowledge processing failed", { projectId, sourceId, error: describeError(err) });
    // No client means nothing was written, and no way to set the status either.
    if (db) await markFailed(db, projectId, sourceId);
    return { status: "failed" };
  }
}

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * Deletes partial chunks and sets status `failed`. The two steps run independently, so
 * a failed delete still marks the source failed. Best effort: logs, never throws.
 */
async function markFailed(db: ServiceClient, projectId: string, sourceId: string): Promise<void> {
  await bestEffort("delete chunks", projectId, sourceId, () =>
    db.from("knowledge_chunks").delete().eq("source_id", sourceId).eq("project_id", projectId),
  );
  await bestEffort("mark failed", projectId, sourceId, () =>
    db.from("knowledge_sources").update({ status: "failed" }).eq("id", sourceId).eq("project_id", projectId),
  );
}

/** Runs one cleanup query; logs (never throws) if it errors or rejects. */
async function bestEffort(
  step: string,
  projectId: string,
  sourceId: string,
  run: () => PromiseLike<{ error: unknown }>,
): Promise<void> {
  try {
    const { error } = await run();
    if (error) throw error;
  } catch (err) {
    console.error("Knowledge processing cleanup incomplete", { step, projectId, sourceId, error: describeError(err) });
  }
}

/**
 * What we log about an error: its name, code and message only. Postgres `details`
 * can quote the failing row (the source's text), so it is never logged.
 */
function describeError(err: unknown): { name: string; code?: string; message: string } {
  if (err && typeof err === "object") {
    const e = err as { name?: unknown; code?: unknown; message?: unknown };
    return {
      name: typeof e.name === "string" ? e.name : "Error",
      ...(typeof e.code === "string" ? { code: e.code } : {}),
      message: typeof e.message === "string" ? e.message.slice(0, 300) : "Unknown error",
    };
  }
  return { name: "Error", message: "Unknown error" };
}
