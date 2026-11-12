import {
  idParamsSchema,
  updateProjectSchema,
  type OkResponse,
  type UpdateProjectResponse,
} from "@askwell/shared";
import type { NextRequest } from "next/server";
import { errorResponse } from "../../../../lib/api/errors";
import { removeProjectFiles } from "../../../../lib/knowledge/storage";
import { currentUserId, PROJECT_COLUMNS, projectFromRow, readJsonBody } from "../../../../lib/projects";
import { createOwnerClient } from "../../../../lib/supabase/owner";

// Owner routes: no CORS headers. Both writes go through the owner client, so RLS
// (and the column grant on projects.name) decide; another owner's project → 404.

const NOT_FOUND = "Project not found.";

/** PATCH /api/projects/:id: rename. */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/projects/[id]">): Promise<Response> {
  if (!(await currentUserId())) return errorResponse("unauthorized", "Sign in required.");

  const params = idParamsSchema.safeParse(await ctx.params);
  if (!params.success) return errorResponse("validation", "Invalid project ID.");
  const input = updateProjectSchema.safeParse(await readJsonBody(request));
  if (!input.success) return errorResponse("validation", "Give the project a name (1–60 characters).");

  const { data, error } = await createOwnerClient()
    .from("projects")
    .update({ name: input.data.name })
    .eq("id", params.data.id)
    .select(PROJECT_COLUMNS)
    .maybeSingle();
  if (error) {
    console.error("rename project failed", error.message);
    return errorResponse("internal", "Something went wrong.");
  }
  if (!data) return errorResponse("not_found", NOT_FOUND);

  const body: UpdateProjectResponse = { project: projectFromRow(data) };
  return Response.json(body);
}

/**
 * DELETE /api/projects/:id: delete with its config, knowledge and conversations (FK
 * cascade), then remove its knowledge files from Storage.
 */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/projects/[id]">): Promise<Response> {
  if (!(await currentUserId())) return errorResponse("unauthorized", "Sign in required.");

  const params = idParamsSchema.safeParse(await ctx.params);
  if (!params.success) return errorResponse("validation", "Invalid project ID.");

  const owner = createOwnerClient();
  // The file keys must be read before the cascade deletes their rows. Owner client: RLS
  // returns nothing for another owner's project.
  const { data: files, error: filesError } = await owner
    .from("knowledge_sources")
    .select("storage_key")
    .eq("project_id", params.data.id);
  if (filesError) {
    console.error("delete project: reading file keys failed", filesError.message);
    return errorResponse("internal", "Something went wrong.");
  }

  const { data, error } = await owner
    .from("projects")
    .delete()
    .eq("id", params.data.id)
    .select("id");
  if (error) {
    console.error("delete project failed", error.message);
    return errorResponse("internal", "Something went wrong.");
  }
  if (data.length === 0) return errorResponse("not_found", NOT_FOUND);

  // The owner owned the project (the delete returned it), so the service client may
  // remove its files: the keys read above plus anything else under its folder (an
  // upload reserved in between). A failed remove is logged with the keys for retry.
  const keys = files.flatMap((f) => (f.storage_key ? [f.storage_key] : []));
  await removeProjectFiles(params.data.id, keys);

  const body: OkResponse = { ok: true };
  return Response.json(body);
}
