/** Headers the app URL is read from (a subset of Web `Headers`). */
type HeaderReader = Pick<Headers, "get">;

/** A bare host, optionally with a port. Rejects anything that could break out of the snippet. */
const HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i;

function firstValue(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}

/**
 * The app's public origin, e.g. `https://askwell.app`, with no trailing slash.
 * `NEXT_PUBLIC_APP_URL` wins when it's a valid http(s) URL; otherwise the request's
 * own origin (`x-forwarded-host`/`-proto` behind Vercel, else `host`), so each
 * preview shows its own URL. Null if neither gives a usable origin.
 */
export function resolveAppUrl(envUrl: string | undefined, headers: HeaderReader): string | null {
  if (envUrl) {
    try {
      const url = new URL(envUrl);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // Fall through to the request's origin.
    }
  }

  const host = firstValue(headers.get("x-forwarded-host")) ?? firstValue(headers.get("host"));
  if (!host || !HOST.test(host)) return null;
  const forwarded = firstValue(headers.get("x-forwarded-proto"));
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const proto = forwarded === "http" || forwarded === "https" ? forwarded : local ? "http" : "https";
  return `${proto}://${host.toLowerCase()}`;
}

/** The app URL for the current request (Server Components and Route Handlers). */
export async function getAppUrl(): Promise<string | null> {
  const { headers } = await import("next/headers");
  return resolveAppUrl(process.env.NEXT_PUBLIC_APP_URL, await headers());
}
