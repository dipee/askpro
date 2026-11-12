import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(async () => {
  const { fakeClient } = await import("../../projects/test-db");
  return { owner: fakeClient("owner"), service: fakeClient("service"), userId: { value: "user_a" as string | null } };
});

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", async () => {
  const s = await h;
  return { auth: async () => ({ userId: s.userId.value }) };
});
vi.mock("../../../../lib/supabase/owner", async () => ({ createOwnerClient: (await h).owner.create }));
vi.mock("../../../../lib/supabase/service", async () => ({ createServiceClient: (await h).service.create }));

const { GET } = await import("./route");
const { owner, service, userId } = await h;

const ID = "22222222-2222-4222-8222-222222222222";
const CONVERSATION = {
  id: ID,
  project_id: "11111111-1111-4111-8111-111111111111",
  visitor_id: "visitor_0001",
  created_at: "2026-11-12T09:00:00+00:00",
};
const MESSAGES = [
  { id: "m1", role: "visitor", body: "Do you ship to Canada?", created_at: "2026-11-12T09:00:01+00:00" },
  { id: "m2", role: "bot", body: "Yes, we do.", created_at: "2026-11-12T09:00:02+00:00" },
];

const get = (id: string) =>
  GET(new NextRequest(`https://askwell.test/api/conversations/${id}`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  for (const c of [owner, service]) {
    c.state.calls = [];
    c.state.results = [];
    c.create.mockClear();
  }
  userId.value = "user_a";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/conversations/:id", () => {
  it("returns the conversation and its messages oldest first, through the owner client", async () => {
    owner.state.results.push({ data: CONVERSATION, error: null }, { data: MESSAGES, error: null });
    const res = await get(ID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      conversation: {
        id: ID,
        projectId: "11111111-1111-4111-8111-111111111111",
        visitorId: "visitor_0001",
        createdAt: "2026-11-12T09:00:00+00:00",
      },
      messages: [
        { id: "m1", role: "visitor", body: "Do you ship to Canada?", createdAt: "2026-11-12T09:00:01+00:00" },
        { id: "m2", role: "bot", body: "Yes, we do.", createdAt: "2026-11-12T09:00:02+00:00" },
      ],
    });
    expect(owner.state.calls).toContainEqual(["eq", "id", ID]);
    expect(owner.state.calls).toContainEqual(["eq", "conversation_id", ID]);
    expect(owner.state.calls).toContainEqual(["order", "created_at", { ascending: true }]);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("an empty thread is 200 with no messages", async () => {
    owner.state.results.push({ data: CONVERSATION, error: null }, { data: [], error: null });
    const res = await get(ID);
    expect(res.status).toBe(200);
    expect((await res.json()).messages).toEqual([]);
  });

  it("401 without a session, before any database call", async () => {
    userId.value = null;
    const res = await get(ID);
    expect(res.status).toBe(401);
    expect(owner.create).not.toHaveBeenCalled();
  });

  it("404 for another owner's conversation (RLS returns no row), without reading messages", async () => {
    owner.state.results.push({ data: null, error: null });
    const res = await get(ID);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "Conversation not found." } });
    expect(owner.state.calls).not.toContainEqual(["from", "messages"]);
  });

  it("400 for a malformed id, before any database call", async () => {
    const res = await get("not-a-uuid");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation");
    expect(owner.create).not.toHaveBeenCalled();
  });

  it("500 when reading messages fails, without leaking the database message", async () => {
    owner.state.results.push({ data: CONVERSATION, error: null }, { data: null, error: { message: "boom" } });
    const res = await get(ID);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "internal", message: "Something went wrong." } });
  });
});
