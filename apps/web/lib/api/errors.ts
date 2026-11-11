import { apiError, ERROR_HTTP_STATUS, type ErrorCode } from "@askwell/shared";

/** `{ error: { code, message } }` with the code's HTTP status (packages/shared). */
export function errorResponse(code: ErrorCode, message: string, headers?: HeadersInit): Response {
  return Response.json(apiError(code, message), { status: ERROR_HTTP_STATUS[code], headers });
}
