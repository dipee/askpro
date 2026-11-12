import type {
  ApiError,
  CreateProjectResponse,
  ErrorCode,
  Project,
  UpdateProjectResponse,
} from "@askwell/shared";

/** Outcome of a call to the projects API, for the UI to branch on. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode | "network"; message: string };

const FALLBACK = "Something went wrong. Please try again.";

async function call<T>(url: string, init: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  } catch {
    return { ok: false, code: "network", message: "Couldn't reach the server. Check your connection." };
  }
  const body: unknown = await res.json().catch(() => undefined);
  if (res.ok) {
    if (body === undefined) return { ok: false, code: "internal", message: FALLBACK };
    return { ok: true, data: body as T };
  }
  const error = (body as Partial<ApiError> | null)?.error;
  return { ok: false, code: error?.code ?? "internal", message: error?.message ?? FALLBACK };
}

/** The `project` from a success body, or a failure if it isn't there. */
function projectOf(r: ApiResult<Partial<CreateProjectResponse | UpdateProjectResponse> | null>): ApiResult<Project> {
  if (!r.ok) return r;
  const project = r.data?.project;
  return project && typeof project.id === "string"
    ? { ok: true, data: project }
    : { ok: false, code: "internal", message: FALLBACK };
}

export function createProject(name: string): Promise<ApiResult<Project>> {
  return call<Partial<CreateProjectResponse> | null>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  }).then(projectOf);
}

export function renameProject(id: string, name: string): Promise<ApiResult<Project>> {
  return call<Partial<UpdateProjectResponse> | null>(`/api/projects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  }).then(projectOf);
}

export function deleteProject(id: string): Promise<ApiResult<null>> {
  return call<unknown>(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) =>
    r.ok ? { ok: true, data: null } : r,
  );
}
