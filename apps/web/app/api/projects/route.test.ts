import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(async () => {
  const { fakeClient } = await import("./test-db");
  return {
    owner: fakeClient("owner"),
    service: fakeClient("service"),
    userId: { value: "user_a" as string | null },
    plan: { value: "free" as "free" | "pro" },
    accountError: { value: null as Error | null },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", async () => {
  const s = await h;
  return { auth: async () => ({ userId: s.userId.value }) };
});
vi.mock("../../../lib/supabase/owner", async () => ({ createOwnerClient: (await h).owner.create }));
vi.mock("../../../lib/supabase/service", async () => ({ createServiceClient: (await h).service.create }));
vi.mock("../../../lib/accounts", async () => {
  const s = await h;
  return {
    ensureAccount: async () => {
      if (s.accountError.value) throw s.accountError.value;
      return { clerkUserId: s.userId.value, plan: s.plan.value, createdAt: "" };
    },
  };
});

const { GET, POST } = await import("./route");
const { owner, service, userId, plan, accountError } = await h;

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Help desk",
  public_key: "pk_abc",
  messages_used: 0,
  period_start: "2026-11-01T00:00:00+00:00",
  created_at: "2026-11-11T10:00:00+00:00",
};
const PROJECT = {
  id: ROW.id,
  name: "Help desk",
  publicKey: "pk_abc",
  messagesUsed: 0,
  periodStart: ROW.period_start,
  createdAt: ROW.created_at,
};

const post = (body: unknown) =>
  POST(new Request("https://askwell.test/api/projects", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));

beforeEach(() => {
  for (const c of [owner, service]) {
    c.state.calls = [];
    c.state.results = [];
    c.create.mockClear();
  }
  userId.value = "user_a";
  plan.value = "free";
  accountError.value = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/projects", () => {
  it("lists the owner's projects newest first, with the owner client only", async () => {
    owner.state.results.push({ data: [ROW], error: null });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ projects: [PROJECT] });
    expect(owner.state.calls).toContainEqual(["order", "created_at", { ascending: false }]);
    expect(service.create).not.toHaveBeenCalled();
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("401 when signed out", async () => {
    userId.value = null;
    const res = await GET();
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
    expect(owner.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/projects", () => {
  it("201: creates through create_project with the Free limit and the Clerk user ID", async () => {
    service.state.results.push({ data: ROW, error: null });
    const res = await post({ name: "  Help desk  " });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ project: PROJECT });
    expect(service.state.calls).toEqual([
      ["rpc", "create_project", { p_owner_id: "user_a", p_name: "Help desk", p_max_projects: 1 }],
    ]);
  });

  it("passes the Pro limit for a Pro account", async () => {
    plan.value = "pro";
    service.state.results.push({ data: ROW, error: null });
    await post({ name: "Help desk" });
    expect(service.state.calls[0][2]).toMatchObject({ p_max_projects: 5 });
  });

  it("ignores any plan or owner the client sends", async () => {
    service.state.results.push({ data: ROW, error: null });
    await post({ name: "Help desk", plan: "pro", ownerId: "user_b", maxProjects: 99 });
    expect(service.state.calls[0][2]).toEqual({ p_owner_id: "user_a", p_name: "Help desk", p_max_projects: 1 });
  });

  it("403 plan_limit at the limit, with an upgrade message on Free", async () => {
    service.state.results.push({ data: null, error: { message: "plan_limit", code: "P0001" } });
    const res = await post({ name: "Second" });
    expect(res.status).toBe(403);
    const { error } = await res.json();
    expect(error.code).toBe("plan_limit");
    expect(error.message).toMatch(/upgrade to pro/i);
  });

  it("403 plan_limit on Pro, without an upgrade message", async () => {
    plan.value = "pro";
    service.state.results.push({ data: null, error: { message: "plan_limit", code: "P0001" } });
    const { error } = await (await post({ name: "Sixth" })).json();
    expect(error.code).toBe("plan_limit");
    expect(error.message).not.toMatch(/upgrade/i);
  });

  it.each([
    ["no name", {}],
    ["an empty name", { name: "   " }],
    ["a too-long name", { name: "x".repeat(61) }],
    ["a non-string name", { name: 42 }],
    ["invalid JSON", "{oops"],
  ])("400 for %s, before any database call", async (_, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation");
    expect(service.create).not.toHaveBeenCalled();
  });

  it("500 on any other database error, without leaking it", async () => {
    service.state.results.push({ data: null, error: { message: "account_not_found", code: "P0002" } });
    const res = await post({ name: "Help desk" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "internal", message: "Something went wrong." } });
  });

  it("500 in the API error shape when reading or creating the account fails", async () => {
    accountError.value = new Error("Reading the account failed: connection refused");
    const res = await post({ name: "Help desk" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "internal", message: "Something went wrong." } });
    expect(service.create).not.toHaveBeenCalled();
  });

  it("401 when signed out", async () => {
    userId.value = null;
    expect((await post({ name: "Help desk" })).status).toBe(401);
    expect(service.create).not.toHaveBeenCalled();
  });
});
