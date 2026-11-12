import { describe, expect, it } from "vitest";
import { resolveAppUrl } from "./app-url";

const h = (entries: Record<string, string> = {}) => new Headers(entries);

describe("resolveAppUrl", () => {
  it("uses NEXT_PUBLIC_APP_URL when set, as a bare origin", () => {
    expect(resolveAppUrl("https://askwell.app", h({ host: "preview.vercel.app" }))).toBe("https://askwell.app");
    expect(resolveAppUrl("https://askwell.app/", h())).toBe("https://askwell.app");
    expect(resolveAppUrl("https://askwell.app/some/path?x=1", h())).toBe("https://askwell.app");
  });

  it("falls back to the request origin when the env value is missing or not a web URL", () => {
    const req = h({ "x-forwarded-host": "askpro-git-x.vercel.app", "x-forwarded-proto": "https" });
    expect(resolveAppUrl(undefined, req)).toBe("https://askpro-git-x.vercel.app");
    expect(resolveAppUrl("", req)).toBe("https://askpro-git-x.vercel.app");
    expect(resolveAppUrl("not a url", req)).toBe("https://askpro-git-x.vercel.app");
    expect(resolveAppUrl("javascript:alert(1)", req)).toBe("https://askpro-git-x.vercel.app");
  });

  it("prefers x-forwarded-host over host and takes the first of several values", () => {
    expect(
      resolveAppUrl(undefined, h({ "x-forwarded-host": "a.example, b.example", host: "internal:3000", "x-forwarded-proto": "https,http" })),
    ).toBe("https://a.example");
  });

  it("uses host, with http for localhost and https otherwise", () => {
    expect(resolveAppUrl(undefined, h({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(resolveAppUrl(undefined, h({ host: "App.Example" }))).toBe("https://app.example");
  });

  it("returns null for a missing or unsafe host", () => {
    expect(resolveAppUrl(undefined, h())).toBeNull();
    expect(resolveAppUrl(undefined, h({ host: 'evil.example"><script>' }))).toBeNull();
    expect(resolveAppUrl(undefined, h({ host: "evil.example/path" }))).toBeNull();
  });
});
