import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ clerkMiddleware: () => () => undefined }));

const { config } = await import("../../proxy");

// Compile the matcher exactly as Next does for proxy.ts.
const require = createRequire(import.meta.url);
const { getMiddlewareMatchers } = require("next/dist/build/analysis/get-page-static-info") as {
  getMiddlewareMatchers: (matchers: string[], nextConfig: Record<string, unknown>) => { regexp: string }[];
};
const regexps = getMiddlewareMatchers(config.matcher, {}).map((m) => new RegExp(m.regexp));

/** True when the Clerk proxy runs for this pathname (query strings aren't matched). */
const proxyRuns = (pathname: string) => regexps.some((r) => r.test(pathname));

describe("proxy matcher", () => {
  it.each(["/embed", "/embed/", "/embed/anything"])("skips %s (the widget iframe panel)", (path) => {
    expect(proxyRuns(path)).toBe(false);
  });

  it("skips /embed?key=… (Next matches the pathname only)", () => {
    expect(proxyRuns(new URL("https://x.test/embed?key=pk_abc&origin=https%3A%2F%2Fshop.test").pathname)).toBe(false);
  });

  it.each([
    "/",
    "/dashboard",
    "/dashboard/billing",
    "/sign-in",
    "/api/projects",
    "/api/projects/abc",
    "/api/widget/config",
    "/api/widget/chat",
    "/embedded",
    "/embeds/x",
  ])("still runs on %s", (path) => {
    expect(proxyRuns(path)).toBe(true);
  });

  it("still skips Next internals and static files", () => {
    expect(proxyRuns("/_next/static/chunks/main.js")).toBe(false);
    expect(proxyRuns("/favicon.ico")).toBe(false);
  });
});
