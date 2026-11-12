import "server-only";
import type { KnowledgeSourceRow } from "@askwell/db";
import {
  idParamsSchema,
  KNOWLEDGE_SOURCE_STATUSES,
  KNOWLEDGE_SOURCE_TYPES,
  PLAN_LIMITS,
  type KnowledgeSource,
  type KnowledgeSourceType,
  type Plan,
} from "@askwell/shared";
import { ensureAccount } from "../../../../../lib/accounts";
import { errorResponse } from "../../../../../lib/api/errors";
import { removeObjects } from "../../../../../lib/knowledge/storage";
import { currentUserId, getOwnedProject } from "../../../../../lib/projects";
import { createServiceClient } from "../../../../../lib/supabase/service";

/** The `knowledge_sources` columns an owner sees (no storage_key). */
export const SOURCE_COLUMNS = "id, project_id, title, type, status, created_at";

type SourceColumns = Pick<KnowledgeSourceRow, "id" | "project_id" | "title" | "type" | "status" | "created_at">;

/** A `knowledge_sources` row as the shared `KnowledgeSource` (camelCase). */
export function sourceFromRow(row: SourceColumns): KnowledgeSource {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    // The table's CHECK constraints limit both columns to these values.
    type: oneOf(KNOWLEDGE_SOURCE_TYPES, row.type),
    status: oneOf(KNOWLEDGE_SOURCE_STATUSES, row.status),
    createdAt: row.created_at,
  };
}

function oneOf<T extends string>(values: readonly T[], value: string): T {
  if (!(values as readonly string[]).includes(value)) throw new Error(`Unexpected value ${value}`);
  return value as T;
}

export const INTERNAL = () => errorResponse("internal", "Something went wrong.");

/** What every project knowledge route knows once the request has passed the gate. */
export type OwnedProjectGate = { projectId: string; plan: Plan };

/**
 * The checks every project knowledge route runs first, in order: Clerk session (401),
 * a valid project id (400), the owner owns the project (404, via RLS: another owner's
 * project looks missing), and the plan read from our database, never the request.
 * Returns a Response to send, or what the route needs.
 */
export async function gateOwnedProject(params: Promise<{ id: string }>): Promise<Response | OwnedProjectGate> {
  if (!(await currentUserId())) return errorResponse("unauthorized", "Sign in required.");

  const parsed = idParamsSchema.safeParse(await params);
  if (!parsed.success) return errorResponse("validation", "Invalid project ID.");

  try {
    const project = await getOwnedProject(parsed.data.id);
    if (!project) return errorResponse("not_found", "Project not found.");
    const account = await ensureAccount();
    return { projectId: project.id, plan: account.plan };
  } catch (error) {
    console.error("knowledge gate failed", error instanceof Error ? error.message : error);
    return INTERNAL();
  }
}

type ReserveInput = { projectId: string; plan: Plan; title: string } & (
  | { type: "text" }
  | { type: Exclude<KnowledgeSourceType, "text">; storageKey: string }
);

/**
 * Reserves a source under the plan's limit (reserve_knowledge_source locks the project
 * row, so concurrent requests can't both pass). Removes the files of any stale uploads
 * the function reclaimed. Returns the new source, or a Response (plan_limit, internal).
 */
export async function reserveSource(input: ReserveInput): Promise<Response | KnowledgeSource> {
  const limit = PLAN_LIMITS[input.plan].knowledgeSources;
  const isText = input.type === "text";
  const { data, error } = await createServiceClient().rpc("reserve_knowledge_source", {
    p_project_id: input.projectId,
    p_title: input.title,
    p_type: input.type,
    p_status: isText ? "processing" : "uploading",
    p_limit: limit,
    ...(isText ? {} : { p_storage_key: input.storageKey }),
  });

  if (error?.message === "plan_limit") {
    const message =
      input.plan === "free"
        ? `The Free plan includes ${limit} knowledge sources per project. Upgrade to Pro for up to ${PLAN_LIMITS.pro.knowledgeSources}, or delete one.`
        : `Your plan includes ${limit} knowledge sources per project. Delete one to add another.`;
    return errorResponse("plan_limit", message);
  }
  const row = data?.[0];
  if (error || !row) {
    console.error("reserve_knowledge_source failed", error?.message);
    return INTERNAL();
  }

  if (row.reclaimed_keys.length > 0) await removeObjects(row.reclaimed_keys, "reclaimed stale uploads");
  return sourceFromRow(row);
}

/** Type guard for the gate and reserve helpers' Response branch. */
export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}
