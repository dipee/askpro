import { describe, expect, it } from "vitest";
import { classifyRoute } from "./routes";
import { unauthorizedResponse } from "./unauthorized";

describe("classifyRoute", () => {
  it.each([
    "/",
    "/sign-in",
    "/sign-in/factor-one",
    "/sign-up",
    "/sign-up/verify-email-address",
    "/embed",
    "/embed/anything",
    "/api/widget/config",
    "/api/widget/chat",
    "/api/clerk/webhook",
    "/api/posthog-config",
  ])("%s is public", (path) => {
    expect(classifyRoute(path)).toBe("public");
  });

  it.each(["/dashboard", "/dashboard/", "/dashboard/projects/abc"])(
    "%s is a protected page",
    (path) => {
      expect(classifyRoute(path)).toBe("protected-page");
    },
  );

  it.each([
    "/api/projects",
    "/api/projects/abc",
    "/api/projects/abc/knowledge/upload-url",
    "/api/knowledge/abc",
    "/api/conversations/abc",
  ])("%s is a protected API route", (path) => {
    expect(classifyRoute(path)).toBe("protected-api");
  });

  it("matches on segment boundaries, not bare prefixes", () => {
    expect(classifyRoute("/dashboards")).toBe("public");
    expect(classifyRoute("/api/projectsx")).toBe("public");
  });
});

describe("unauthorizedResponse", () => {
  it("returns 401 with the API error shape", async () => {
    const res = unauthorizedResponse();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "unauthorized", message: "Sign in required." },
    });
  });
});
