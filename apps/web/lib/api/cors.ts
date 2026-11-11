/**
 * CORS for the public widget routes (project.md §9): any origin, no credentials.
 * Owner routes must not use these headers.
 */
export type PublicMethod = "GET" | "POST";

export function publicCorsHeaders(methods: readonly PublicMethod[]): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": [...methods, "OPTIONS"].join(", "),
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

/** 204 answer to a CORS preflight for a public route. */
export function publicPreflight(methods: readonly PublicMethod[]): Response {
  return new Response(null, { status: 204, headers: publicCorsHeaders(methods) });
}
