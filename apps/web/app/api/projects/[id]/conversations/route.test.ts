import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(async () => {
  const { fakeClient } = await import("../../test-db");
  return { owner: fakeClient("owner"), service: fakeClient("service"), userId: { value: "user_a" as string | null } };
});

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", async () => {
  const s = await h;
  return { auth: async () => ({ userId: s.userId.value }) };
});
vi.mock("../../../../../lib/supabase/owner", async () => ({ createOwnerClient: (await h).owner.create }));
vi.mock("../../../../../lib/supabase/service", async () => ({ createServiceClient: (await h).service.create }));

const { GET } = await import("./route");
const { owner, service, userId } = await h;

const ID = "11111111-1111-4111-8111-111111111111";
const PROJECT = {
  id: ID,
  name: "Desk",
  public_key: "pk_abc",
  messages_used: 3,
  period_start: "2026-11-01T00:00:00+00:00",
  created_at: "2026-11-11T10:00:00+00:00",
};
const ACTIVITY = [
  { id: "c2", visitor_id: "visitor_0002", created_at: "2026-11-12T10:00:00+00:00", preview: "Hello", message_count: 2 },
  { id: "c1", visitor_id: "visitor_0001", created_at: "2026-11-12T09:00:00+00:00", preview: null, message_count: 0 },
];

const get = (id: string, query = "") =>
  GET(new NextRequest(`https://askwell.test/api/projects/${id}/conversations${query}`), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  for (const c of [owner, service]) {
    c.state.calls = [];
    c.state.results = [];
    c.create.mockClear();
  }
  userId.value = "user_a";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/projects/:id/conversations", () => {
  it("lists owner_activity rows as ConversationSummary[], default page, owner client only", async () => {
    owner.state.results.push({ data: PROJECT, error: null }, { data: ACTIVITY, error: null });
    const res = await get(ID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      conversations: [
        { id: "c2", visitorId: "visitor_0002", createdAt: "2026-11-12T10:00:00+00:00", preview: "Hello", messageCount: 2 },
        { id: "c1", visitorId: "visitor_0001", createdAt: "2026-11-12T09:00:00+00:00", preview: null, messageCount: 0 },
      ],
    });
    expect(owner.state.calls).toContainEqual(["rpc", "owner_activity", { p_project_id: ID, p_limit: 50, p_offset: 0 }]);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("passes limit and offset from the query", async () => {
    owner.state.results.push({ data: PROJECT, error: null }, { data: [], error: null });
    const res = await get(ID, "?limit=20&offset=40");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conversations: [] });
    expect(owner.state.calls).toContainEqual(["rpc", "owner_activity", { p_project_id: ID, p_limit: 20, p_offset: 40 }]);
  });

  it("401 without a session, before any database call", async () => {
    userId.value = null;
    const res = await get(ID);
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
    expect(owner.create).not.toHaveBeenCalled();
  });

  it("404 for another owner's project (RLS returns no project row), without calling owner_activity", async () => {
    owner.state.results.push({ data: null, error: null });
    const res = await get(ID);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "Project not found." } });
    expect(owner.state.calls.some((c) => c[0] === "rpc")).toBe(false);
  });

  it.each([
    ["a malformed id", "not-a-uuid", ""],
    ["limit 0", ID, "?limit=0"],
    ["limit 101", ID, "?limit=101"],
    ["a fractional limit", ID, "?limit=2.5"],
    ["a non-number limit", ID, "?limit=ten"],
    ["a negative offset", ID, "?offset=-1"],
  ])("400 for %s, before any database call", async (_, id, query) => {
    const res = await get(id, query);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation");
    expect(owner.create).not.toHaveBeenCalled();
  });

  it("500 when the read fails, without leaking the database message", async () => {
    owner.state.results.push({ data: PROJECT, error: null }, { data: null, error: { message: "boom" } });
    const res = await get(ID);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "internal", message: "Something went wrong." } });
  });

  it("sends no CORS headers (owner route)", async () => {
    owner.state.results.push({ data: PROJECT, error: null }, { data: [], error: null });
    expect((await get(ID)).headers.get("access-control-allow-origin")).toBeNull();
  });
});
