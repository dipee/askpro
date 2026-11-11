/** Every error code an API route may return. */
export const ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "validation",
  "plan_limit",
  "payment_required",
  "rate_limited",
  "quota_exceeded",
  "message_blocked",
  "internal",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Body of every error response. */
export interface ApiError {
  error: { code: ErrorCode; message: string };
}

/** HTTP status for each error code. */
export const ERROR_HTTP_STATUS = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation: 400,
  plan_limit: 403,
  payment_required: 402,
  rate_limited: 429,
  quota_exceeded: 429,
  message_blocked: 400,
  internal: 500,
} as const satisfies Record<ErrorCode, number>;

export function apiError(code: ErrorCode, message: string): ApiError {
  return { error: { code, message } };
}
