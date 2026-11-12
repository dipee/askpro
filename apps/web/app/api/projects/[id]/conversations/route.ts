import { idParamsSchema, listConversationsQuerySchema, type ListConversationsResponse } from "@askwell/shared";
import type { NextRequest } from "next/server";
import { errorResponse } from "../../../../../lib/api/errors";
import { queryObject, toConversationSummary } from "../../../../../lib/conversations";
import { currentUserId, getOwnedProject } from "../../../../../lib/projects";
import { createOwnerClient } from "../../../../../lib/supabase/owner";

// Owner route: no CORS headers. Owner client only; RLS scopes every read.

/**
 * GET /api/projects/:id/conversations?limit=&offset=: one page of the project's
 * conversations, newest first, each with its first visitor message and message count
 * (owner_activity). Another owner's project → 404, the same as a missing one.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/conversations">,
): Promise<Response> {
  if (!(await currentUserId())) return errorResponse("unauthorized", "Sign in required.");

  const params = idParamsSchema.safeParse(await ctx.params);
  if (!params.success) return errorResponse("validation", "Invalid project ID.");
  const query = listConversationsQuerySchema.safeParse(queryObject(request.nextUrl.searchParams));
  if (!query.success) {
    return errorResponse("validation", "limit must be 1–100 and offset 0 or more.");
  }

  try {
    // owner_activity returns no rows for another owner's project, which would look like
    // an empty list. Check the project first so that case is a 404.
    const project = await getOwnedProject(params.data.id);
    if (!project) return errorResponse("not_found", "Project not found.");

    const { data, error } = await createOwnerClient().rpc("owner_activity", {
      p_project_id: project.id,
      p_limit: query.data.limit,
      p_offset: query.data.offset,
    });
    if (error) throw new Error(error.message);

    const body: ListConversationsResponse = { conversations: data.map(toConversationSummary) };
    return Response.json(body);
  } catch (error) {
    console.error("list conversations failed", error instanceof Error ? error.message : error);
    return errorResponse("internal", "Something went wrong.");
  }
}
