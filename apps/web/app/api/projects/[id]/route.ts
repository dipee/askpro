import {
  idParamsSchema,
  updateProjectSchema,
  type OkResponse,
  type UpdateProjectResponse,
} from "@askwell/shared";
import type { NextRequest } from "next/server";
import { errorResponse } from "../../../../lib/api/errors";
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

/** DELETE /api/projects/:id: delete with its config, knowledge and conversations (FK cascade). */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/projects/[id]">): Promise<Response> {
  if (!(await currentUserId())) return errorResponse("unauthorized", "Sign in required.");

  const params = idParamsSchema.safeParse(await ctx.params);
  if (!params.success) return errorResponse("validation", "Invalid project ID.");

  const { data, error } = await createOwnerClient()
    .from("projects")
    .delete()
    .eq("id", params.data.id)
    .select("id");
  if (error) {
    console.error("delete project failed", error.message);
    return errorResponse("internal", "Something went wrong.");
  }
  if (data.length === 0) return errorResponse("not_found", NOT_FOUND);

  const body: OkResponse = { ok: true };
  return Response.json(body);
}
