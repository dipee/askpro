// Which paths need a signed-in owner. Used by `proxy.ts`.
// Pure (no Clerk import) so it can be unit-tested.

export const SIGN_IN_URL = "/sign-in";
export const SIGN_UP_URL = "/sign-up";
export const AFTER_AUTH_URL = "/dashboard";
export const AFTER_SIGN_OUT_URL = SIGN_IN_URL;

/** Pages that redirect to sign-in when signed out. */
const PROTECTED_PAGE_PREFIXES = ["/dashboard"] as const;

/** Owner API routes that answer 401 when signed out. */
const PROTECTED_API_PREFIXES = [
  "/api/projects",
  "/api/knowledge",
  "/api/conversations",
] as const;

export type RouteAccess = "public" | "protected-page" | "protected-api";

/** True when `pathname` is `prefix` itself or a path under it (segment boundary). */
function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function classifyRoute(pathname: string): RouteAccess {
  if (PROTECTED_API_PREFIXES.some((p) => underPrefix(pathname, p))) {
    return "protected-api";
  }
  if (PROTECTED_PAGE_PREFIXES.some((p) => underPrefix(pathname, p))) {
    return "protected-page";
  }
  return "public";
}
