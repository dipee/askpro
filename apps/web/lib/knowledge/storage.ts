import "server-only";
import { randomUUID } from "node:crypto";
import type { UploadExtension } from "@askwell/shared";
import { createServiceClient } from "../supabase/service";

/**
 * The private `knowledge` bucket (migration 20261112024224). Only service_role reaches
 * it, so every helper here uses the service client: call them only after the route has
 * checked that the owner owns the project (project.md §9).
 */
export const KNOWLEDGE_BUCKET = "knowledge";

/** `<projectId>/<random uuid>.<ext>`: unguessable, and grouped by project. */
export function newStorageKey(projectId: string, ext: UploadExtension): string {
  return `${projectId}/${randomUUID()}.${ext}`;
}

/** A one-time signed URL (and its token) the browser PUTs the file to. Never overwrites. */
export async function createUploadUrl(key: string): Promise<{ uploadUrl: string; token: string }> {
  const { data, error } = await createServiceClient().storage.from(KNOWLEDGE_BUCKET).createSignedUploadUrl(key);
  if (error) throw new Error(`Creating the upload URL failed: ${error.message}`);
  return { uploadUrl: data.signedUrl, token: data.token };
}

/** The object's bytes, or null if it doesn't exist (e.g. the upload never happened). */
export async function downloadObject(key: string): Promise<Uint8Array | null> {
  const { data, error } = await createServiceClient().storage.from(KNOWLEDGE_BUCKET).download(key);
  if (error) {
    if (isNotFound(error)) return null;
    throw new Error(`Downloading the file failed: ${error.message}`);
  }
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Removes objects from the bucket. Best effort: never throws. On failure it logs the
 * keys so they can be removed later, and returns false. Missing objects count as removed.
 */
export async function removeObjects(keys: readonly string[], reason: string): Promise<boolean> {
  const unique = [...new Set(keys)].filter(Boolean);
  if (unique.length === 0) return true;
  try {
    const { error } = await createServiceClient().storage.from(KNOWLEDGE_BUCKET).remove(unique);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Knowledge storage remove failed; retry these keys", {
      reason,
      keys: unique,
      error: errorMessage(err),
    });
    return false;
  }
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return String(err);
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: unknown; statusCode?: unknown; message?: unknown; name?: unknown };
  // Storage answers a missing object with HTTP 400 and `statusCode: "404"` in the body.
  if (Number(e.status) === 404 || Number(e.statusCode) === 404) return true;
  return typeof e.message === "string" && /not.?found/i.test(e.message);
}
