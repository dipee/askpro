import "server-only";
import type { ProjectRow } from "@askwell/db";
import type { Project } from "@askwell/shared";
import { auth } from "@clerk/nextjs/server";
import { createOwnerClient } from "./supabase/owner";

/** The `projects` columns an owner sees (no owner_id). */
export const PROJECT_COLUMNS = "id, name, public_key, messages_used, period_start, created_at";

type ProjectColumns = Pick<
  ProjectRow,
  "id" | "name" | "public_key" | "messages_used" | "period_start" | "created_at"
>;

/** A `projects` row as the shared `Project` (camelCase). */
export function projectFromRow(row: ProjectColumns): Project {
  return {
    id: row.id,
    name: row.name,
    publicKey: row.public_key,
    messagesUsed: row.messages_used,
    periodStart: row.period_start,
    createdAt: row.created_at,
  };
}

/** The signed-in Clerk user ID from the server session, or null when signed out. */
export async function currentUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}

/**
 * The project if it exists and the signed-in owner owns it, else null. Reads with
 * the owner client, so RLS decides: another owner's project looks the same as a
 * missing one. Call it before any service-client write for a project.
 */
export async function getOwnedProject(id: string): Promise<Project | null> {
  const { data, error } = await createOwnerClient()
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Reading the project failed: ${error.message}`);
  return data ? projectFromRow(data) : null;
}

/** The request's JSON body, or `undefined` if it isn't valid JSON. */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
