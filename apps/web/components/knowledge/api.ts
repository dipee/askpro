import {
  UPLOAD_CONTENT_TYPES,
  type ApiError,
  type CreateTextKnowledgeResponse,
  type FinalizeKnowledgeResponse,
  type KnowledgeSource,
  type KnowledgeUploadUrlResponse,
  type UploadExtension,
} from "@askwell/shared";
import type { ApiResult } from "../projects/api";

export type { ApiResult };

const FALLBACK = "Something went wrong. Please try again.";
const OFFLINE = "Couldn't reach the server. Check your connection.";

async function call<T>(url: string, init: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  } catch {
    return { ok: false, code: "network", message: OFFLINE };
  }
  const body: unknown = await res.json().catch(() => undefined);
  if (res.ok) {
    return body === undefined ? { ok: false, code: "internal", message: FALLBACK } : { ok: true, data: body as T };
  }
  const error = (body as Partial<ApiError> | null)?.error;
  return { ok: false, code: error?.code ?? "internal", message: error?.message ?? FALLBACK };
}

/** The `source` from a success body, or a failure if it isn't there. */
function sourceOf(r: ApiResult<{ source?: KnowledgeSource } | null>): ApiResult<KnowledgeSource> {
  if (!r.ok) return r;
  const source = r.data?.source;
  return source && typeof source.id === "string" ? { ok: true, data: source } : { ok: false, code: "internal", message: FALLBACK };
}

const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/knowledge`;

/** Paste text. Resolves once it's processed: the source is `ready` or `failed`. */
export function pasteText(projectId: string, title: string, text: string): Promise<ApiResult<KnowledgeSource>> {
  return call<Partial<CreateTextKnowledgeResponse> | null>(base(projectId), {
    method: "POST",
    body: JSON.stringify({ title, text }),
  }).then(sourceOf);
}

/** Reserve a file source and get its one-time signed upload URL. */
export async function requestUpload(
  projectId: string,
  title: string,
  file: { name: string; size: number },
): Promise<ApiResult<KnowledgeUploadUrlResponse>> {
  const r = await call<Partial<KnowledgeUploadUrlResponse> | null>(`${base(projectId)}/upload-url`, {
    method: "POST",
    body: JSON.stringify({ title, fileName: file.name, size: file.size }),
  });
  if (!r.ok) return r;
  const { source, uploadUrl, token } = r.data ?? {};
  return source && uploadUrl && token
    ? { ok: true, data: { source, uploadUrl, token } }
    : { ok: false, code: "internal", message: FALLBACK };
}

/**
 * PUTs the file to the signed Storage URL, reporting progress (0–1). XMLHttpRequest
 * because fetch can't report upload progress. The content type comes from the
 * extension: browsers often leave `file.type` empty for .md.
 */
export function putFile(
  uploadUrl: string,
  file: Blob,
  ext: UploadExtension,
  onProgress: (fraction: number) => void,
): Promise<ApiResult<null>> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", UPLOAD_CONTENT_TYPES[ext]);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      resolve(
        xhr.status >= 200 && xhr.status < 300
          ? { ok: true, data: null }
          : { ok: false, code: "internal", message: "The upload didn't go through. Please try again." },
      );
    xhr.onerror = () => resolve({ ok: false, code: "network", message: OFFLINE });
    xhr.send(file);
  });
}

/** After the upload: the server checks the file and processes it. */
export function finalizeUpload(projectId: string, sourceId: string): Promise<ApiResult<KnowledgeSource>> {
  return call<Partial<FinalizeKnowledgeResponse> | null>(`${base(projectId)}/finalize`, {
    method: "POST",
    body: JSON.stringify({ sourceId }),
  }).then(sourceOf);
}

export function deleteSource(sourceId: string): Promise<ApiResult<null>> {
  return call<unknown>(`/api/knowledge/${encodeURIComponent(sourceId)}`, { method: "DELETE" }).then((r) =>
    r.ok ? { ok: true, data: null } : r,
  );
}
