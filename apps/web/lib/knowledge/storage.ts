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

/** Page size for listing a project's folder (Pro allows 25 sources). */
const LIST_PAGE = 1000;

/** Every object key under `<projectId>/`. */
export async function listProjectKeys(projectId: string): Promise<string[]> {
  const keys: string[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await createServiceClient()
      .storage.from(KNOWLEDGE_BUCKET)
      .list(projectId, { limit: LIST_PAGE, offset });
    if (error) throw new Error(`Listing the project's files failed: ${error.message}`);
    keys.push(...data.map((o) => `${projectId}/${o.name}`));
    if (data.length < LIST_PAGE) return keys;
  }
}

/**
 * After a project is deleted: removes the files its sources pointed at, plus anything
 * else under `<projectId>/` (e.g. an upload reserved after `knownKeys` was read).
 * Best effort: never throws; failures are logged with the keys.
 */
export async function removeProjectFiles(projectId: string, knownKeys: readonly string[]): Promise<boolean> {
  let listed: string[] = [];
  try {
    listed = await listProjectKeys(projectId);
  } catch (err) {
    console.error("Knowledge storage list failed; removing the known keys only", { projectId, error: errorMessage(err) });
  }
  return removeObjects([...knownKeys, ...listed], `deleted project ${projectId}`);
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

/**
 * True only for a missing object. Storage answers HTTP 400 with `statusCode: "404"` for
 * several things (a missing bucket too), so only the object-specific code counts.
 */
function isNotFound(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { code?: unknown }).code === "NoSuchKey";
}
