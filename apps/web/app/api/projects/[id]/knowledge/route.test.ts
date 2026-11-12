import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(async () => {
  const { fakeClient } = await import("../../test-db");
  return {
    owner: fakeClient("owner"),
    service: fakeClient("service"),
    userId: { value: "user_a" as string | null },
    plan: { value: "free" as "free" | "pro" },
  };
});
const processSource = vi.hoisted(() => vi.fn());
const removeObjects = vi.hoisted(() => vi.fn(async () => true));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", async () => {
  const s = await h;
  return { auth: async () => ({ userId: s.userId.value }) };
});
vi.mock("../../../../../lib/supabase/owner", async () => ({ createOwnerClient: (await h).owner.create }));
vi.mock("../../../../../lib/supabase/service", async () => ({ createServiceClient: (await h).service.create }));
vi.mock("../../../../../lib/accounts", async () => {
  const s = await h;
  return { ensureAccount: async () => ({ clerkUserId: "user_a", plan: s.plan.value, createdAt: "" }) };
});
vi.mock("../../../../../lib/knowledge/process", () => ({ processSource }));
vi.mock("../../../../../lib/knowledge/storage", () => ({ removeObjects }));

const { POST } = await import("./route");
const { owner, service, userId, plan } = await h;

const PID = "11111111-1111-4111-8111-111111111111";
const SID = "22222222-2222-4222-8222-222222222222";
const PROJECT = {
  id: PID,
  name: "Shop",
  public_key: "pk_abc",
  messages_used: 0,
  period_start: "2026-11-01T00:00:00+00:00",
  created_at: "2026-11-11T10:00:00+00:00",
};
const RESERVED = {
  id: SID,
  project_id: PID,
  title: "Refunds",
  type: "text",
  storage_key: null,
  status: "processing",
  created_at: "2026-11-12T10:00:00+00:00",
  reclaimed_keys: [] as string[],
};

const post = (id: string, body: unknown) =>
  POST(
    new NextRequest(`https://askwell.test/api/projects/${id}/knowledge`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
const ok = { title: " Refunds ", text: "Refunds take 5 days." };

beforeEach(() => {
  for (const c of [owner, service]) {
    c.state.calls = [];
    c.state.results = [];
    c.create.mockClear();
  }
  userId.value = "user_a";
  plan.value = "free";
  processSource.mockReset();
  processSource.mockResolvedValue({ status: "ready", chunkCount: 1 });
  removeObjects.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/projects/:id/knowledge", () => {
  it("reserves a text source under the Free limit, processes it and returns it ready", async () => {
    owner.state.results.push({ data: PROJECT, error: null });
    service.state.results.push({ data: [RESERVED], error: null });

    const res = await post(PID, ok);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      source: { id: SID, projectId: PID, title: "Refunds", type: "text", status: "ready", createdAt: RESERVED.created_at },
    });
    expect(service.state.calls).toEqual([
      [
        "rpc",
        "reserve_knowledge_source",
        { p_project_id: PID, p_title: "Refunds", p_type: "text", p_status: "processing", p_limit: 3 },
      ],
    ]);
    expect(processSource).toHaveBeenCalledWith({ projectId: PID, sourceId: SID, text: "Refunds take 5 days." });
    expect(removeObjects).not.toHaveBeenCalled();
  });

  it("uses the Pro limit for a Pro owner", async () => {
    plan.value = "pro";
    owner.state.results.push({ data: PROJECT, error: null });
    service.state.results.push({ data: [RESERVED], error: null });
    await post(PID, ok);
    expect(service.state.calls[0][2]).toMatchObject({ p_limit: 25 });
  });

  it("returns the source as failed when processing fails", async () => {
    owner.state.results.push({ data: PROJECT, error: null });
    service.state.results.push({ data: [RESERVED], error: null });
    processSource.mockResolvedValue({ status: "failed" });
    const res = await post(PID, ok);
    expect(res.status).toBe(201);
    expect((await res.json()).source.status).toBe("failed");
  });

  it("removes the files of stale uploads the reservation reclaimed", async () => {
    owner.state.results.push({ data: PROJECT, error: null });
    service.state.results.push({ data: [{ ...RESERVED, reclaimed_keys: [`${PID}/old.pdf`] }], error: null });
    await post(PID, ok);
    expect(removeObjects).toHaveBeenCalledWith([`${PID}/old.pdf`], "reclaimed stale uploads");
  });

  it("403 plan_limit at the limit, without processing", async () => {
    owner.state.results.push({ data: PROJECT, error: null });
    service.state.results.push({ data: null, error: { message: "plan_limit", code: "P0001" } });
    const res = await post(PID, ok);
    expect(res.status).toBe(403);
    const { error } = await res.json();
    expect(error.code).toBe("plan_limit");
    expect(error.message).toContain("3 knowledge sources");
    expect(processSource).not.toHaveBeenCalled();
  });

  it("404 for another owner's project (RLS returns no row), touching nothing", async () => {
    owner.state.results.push({ data: null, error: null });
    const res = await post(PID, ok);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "Project not found." } });
    expect(service.create).not.toHaveBeenCalled();
    expect(processSource).not.toHaveBeenCalled();
  });

  it.each([
    ["no title", { title: " ", text: "x" }],
    ["no text", { title: "T", text: "  " }],
    ["a too-long title", { title: "x".repeat(201), text: "x" }],
    ["too much text", { title: "T", text: "x".repeat(100_001) }],
    ["invalid JSON", "{oops"],
  ])("400 for %s, reserving nothing", async (_, body) => {
    owner.state.results.push({ data: PROJECT, error: null });
    const res = await post(PID, body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation");
    expect(service.create).not.toHaveBeenCalled();
  });

  it("400 for a bad project id", async () => {
    expect((await post("nope", ok)).status).toBe(400);
    expect(owner.create).not.toHaveBeenCalled();
  });

  it("401 when signed out", async () => {
    userId.value = null;
    expect((await post(PID, ok)).status).toBe(401);
    expect(owner.create).not.toHaveBeenCalled();
  });

  it("500 when the reservation fails, without leaking the error", async () => {
    owner.state.results.push({ data: PROJECT, error: null });
    service.state.results.push({ data: null, error: { message: "boom" } });
    const res = await post(PID, ok);
    expect(res.status).toBe(500);
    expect((await res.json()).error.message).toBe("Something went wrong.");
  });
});
