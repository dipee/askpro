import { describe, expect, it } from "vitest";
import { publicCorsHeaders, publicPreflight } from "./cors";
import { errorResponse } from "./errors";

describe("errorResponse", () => {
  it.each([
    ["validation", 400],
    ["not_found", 404],
    ["plan_limit", 403],
    ["internal", 500],
  ] as const)("%s → %i with the shared error body", async (code, status) => {
    const res = errorResponse(code, "Nope.", { "X-Test": "1" });
    expect(res.status).toBe(status);
    expect(res.headers.get("x-test")).toBe("1");
    expect(await res.json()).toEqual({ error: { code, message: "Nope." } });
  });
});

describe("public CORS", () => {
  it("allows any origin, without credentials", () => {
    const headers = publicCorsHeaders(["GET", "POST"]);
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(headers["Access-Control-Allow-Methods"]).toBe("GET, POST, OPTIONS");
    expect(Object.keys(headers)).not.toContain("Access-Control-Allow-Credentials");
  });

  it("answers a preflight with 204 and no body", async () => {
    const res = publicPreflight(["POST"]);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(await res.text()).toBe("");
  });
});
