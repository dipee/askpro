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
  const body: unknown = await res.json().catch(() => null);
  if (res.ok) return { ok: true, data: body as T };
  const error = (body as Partial<ApiError> | null)?.error;
  return { ok: false, code: error?.code ?? "internal", message: error?.message ?? FALLBACK };
}

export function createProject(name: string): Promise<ApiResult<Project>> {
  return call<CreateProjectResponse>("/api/projects", { method: "POST", body: JSON.stringify({ name }) }).then(
    (r) => (r.ok ? { ok: true, data: r.data.project } : r),
  );
}

export function renameProject(id: string, name: string): Promise<ApiResult<Project>> {
  return call<UpdateProjectResponse>(`/api/projects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  }).then((r) => (r.ok ? { ok: true, data: r.data.project } : r));
}

export function deleteProject(id: string): Promise<ApiResult<null>> {
  return call<unknown>(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) =>
    r.ok ? { ok: true, data: null } : r,
  );
}
