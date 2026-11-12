import { idParamsSchema, type OkResponse } from "@askwell/shared";
import type { NextRequest } from "next/server";
import { errorResponse } from "../../../../lib/api/errors";
import { removeObjects } from "../../../../lib/knowledge/storage";
import { currentUserId } from "../../../../lib/projects";
import { createOwnerClient } from "../../../../lib/supabase/owner";
import { createServiceClient } from "../../../../lib/supabase/service";

// Owner route: no CORS headers.

const NOT_FOUND = "Knowledge source not found.";

/**
 * DELETE /api/knowledge/:id: deletes a source, its chunks (FK cascade) and its file.
 *
 * Ownership: the source is read with the owner client, so RLS only returns it if the
 * owner owns its project (another owner's source looks missing). Owners can't delete
 * sources themselves, so the delete and the file removal use the service client, after
 * that check (project.md §9).
 */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/knowledge/[id]">): Promise<Response> {
  if (!(await currentUserId())) return errorResponse("unauthorized", "Sign in required.");

  const params = idParamsSchema.safeParse(await ctx.params);
  if (!params.success) return errorResponse("validation", "Invalid source ID.");
  const id = params.data.id;

  const { data: owned, error: readError } = await createOwnerClient()
    .from("knowledge_sources")
    .select("id, project_id, storage_key")
    .eq("id", id)
    .maybeSingle();
  if (readError) {
    console.error("delete knowledge: read failed", { id, error: readError.message });
    return errorResponse("internal", "Something went wrong.");
  }
  if (!owned) return errorResponse("not_found", NOT_FOUND);

  const { data: deleted, error: deleteError } = await createServiceClient()
    .from("knowledge_sources")
    .delete()
    .eq("id", owned.id)
    .eq("project_id", owned.project_id)
    .select("storage_key");
  if (deleteError) {
    console.error("delete knowledge: delete failed", { id, error: deleteError.message });
    return errorResponse("internal", "Something went wrong.");
  }
  // Gone already (a concurrent delete): that call removes the file.
  if (deleted.length === 0) return errorResponse("not_found", NOT_FOUND);

  // After the row is gone, so a failed remove leaves an orphan file (logged for retry),
  // never a source pointing at a missing file.
  const key = deleted[0].storage_key;
  if (key) await removeObjects([key], `deleted source ${id}`);

  const body: OkResponse = { ok: true };
  return Response.json(body);
}
