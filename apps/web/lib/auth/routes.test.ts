import { describe, expect, it, vi } from "vitest";
import { classifyRoute, gateRequest, type GateAuth } from "./routes";
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

const BASE = "https://askwell.test";

function fakeAuth(isAuthenticated: boolean) {
  const redirectToSignIn = vi.fn(
    ({ returnBackUrl }: { returnBackUrl: string }) =>
      Response.redirect(
        `${BASE}/sign-in?redirect_url=${encodeURIComponent(returnBackUrl)}`,
        307,
      ),
  );
  const getAuth = vi.fn(
    async (): Promise<GateAuth> => ({ isAuthenticated, redirectToSignIn }),
  );
  return { getAuth, redirectToSignIn };
}

describe("gateRequest", () => {
  it("answers a signed-out /api/projects request with a 401 JSON error", async () => {
    const { getAuth, redirectToSignIn } = fakeAuth(false);
    const res = await gateRequest(getAuth, new URL(`${BASE}/api/projects`));

    expect(res?.status).toBe(401);
    expect(res?.headers.get("content-type")).toContain("application/json");
    expect(await res?.json()).toEqual({
      error: { code: "unauthorized", message: "Sign in required." },
    });
    expect(redirectToSignIn).not.toHaveBeenCalled();
  });

  it("redirects a signed-out /dashboard request to sign-in", async () => {
    const { getAuth, redirectToSignIn } = fakeAuth(false);
    const url = new URL(`${BASE}/dashboard`);
    const res = await gateRequest(getAuth, url);

    expect(redirectToSignIn).toHaveBeenCalledWith({
      returnBackUrl: url.toString(),
    });
    expect(res?.status).toBe(307);
    expect(res?.headers.get("location")).toContain("/sign-in");
  });

  it("lets signed-in owners through", async () => {
    const { getAuth } = fakeAuth(true);
    expect(
      await gateRequest(getAuth, new URL(`${BASE}/api/projects`)),
    ).toBeUndefined();
    expect(
      await gateRequest(getAuth, new URL(`${BASE}/dashboard`)),
    ).toBeUndefined();
  });

  it("skips auth on public routes", async () => {
    const { getAuth } = fakeAuth(false);
    for (const path of ["/", "/embed", "/api/widget/config"]) {
      expect(await gateRequest(getAuth, new URL(`${BASE}${path}`))).toBeUndefined();
    }
    expect(getAuth).not.toHaveBeenCalled();
  });
});
