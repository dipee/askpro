import {
  createProjectSchema,
  PLAN_LIMITS,
  type CreateProjectResponse,
  type ListProjectsResponse,
} from "@askwell/shared";
import { ensureAccount } from "../../../lib/accounts";
import { errorResponse } from "../../../lib/api/errors";
import { currentUserId, PROJECT_COLUMNS, projectFromRow, readJsonBody } from "../../../lib/projects";
import { createOwnerClient } from "../../../lib/supabase/owner";
import { createServiceClient } from "../../../lib/supabase/service";

// Owner routes: no CORS headers. proxy.ts already answers 401 when signed out;
// each handler checks again.

/** GET /api/projects: the owner's projects, newest first (RLS scopes the read). */
export async function GET(): Promise<Response> {
  if (!(await currentUserId())) return errorResponse("unauthorized", "Sign in required.");

  const { data, error } = await createOwnerClient()
    .from("projects")
    .select(PROJECT_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("list projects failed", error.message);
    return errorResponse("internal", "Something went wrong.");
  }

  const body: ListProjectsResponse = { projects: data.map(projectFromRow) };
  return Response.json(body);
}

/** POST /api/projects: create a project under the owner's plan limit. */
export async function POST(request: Request): Promise<Response> {
  const userId = await currentUserId();
  if (!userId) return errorResponse("unauthorized", "Sign in required.");

  const input = createProjectSchema.safeParse(await readJsonBody(request));
  if (!input.success) return errorResponse("validation", "Give the project a name (1–60 characters).");

  // The plan comes from our database, never from the request (project.md §5).
  // ensureAccount() creates the Free account row on a brand-new user's first call.
  let account: Awaited<ReturnType<typeof ensureAccount>>;
  try {
    account = await ensureAccount();
  } catch (error) {
    console.error("ensureAccount failed", error instanceof Error ? error.message : error);
    return errorResponse("internal", "Something went wrong.");
  }
  const maxProjects = PLAN_LIMITS[account.plan].projects;

  // Service client only for create_project, for the user ID Clerk's auth() returned.
  // The function locks the account row and enforces the limit in Postgres.
  const { data, error } = await createServiceClient().rpc("create_project", {
    p_owner_id: userId,
    p_name: input.data.name,
    p_max_projects: maxProjects,
  });

  if (error?.message === "plan_limit") {
    const message =
      account.plan === "free"
        ? `The Free plan includes ${maxProjects} project. Upgrade to Pro to create up to ${PLAN_LIMITS.pro.projects}.`
        : `Your plan includes ${maxProjects} projects. Delete one to create another.`;
    return errorResponse("plan_limit", message);
  }
  if (error || !data) {
    console.error("create_project failed", error?.message);
    return errorResponse("internal", "Something went wrong.");
  }

  const body: CreateProjectResponse = { project: projectFromRow(data) };
  return Response.json(body, { status: 201 });
}
