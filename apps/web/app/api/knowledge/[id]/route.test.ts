import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(async () => {
  const { fakeClient } = await import("../../projects/test-db");
  return { owner: fakeClient("owner"), service: fakeClient("service"), userId: { value: "user_a" as string | null } };
});
const removeObjects = vi.hoisted(() => vi.fn(async () => true));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", async () => {
  const s = await h;
  return { auth: async () => ({ userId: s.userId.value }) };
});
vi.mock("../../../../lib/supabase/owner", async () => ({ createOwnerClient: (await h).owner.create }));
vi.mock("../../../../lib/supabase/service", async () => ({ createServiceClient: (await h).service.create }));
vi.mock("../../../../lib/knowledge/storage", () => ({ removeObjects }));

const { DELETE } = await import("./route");
const { owner, service, userId } = await h;

const PID = "11111111-1111-4111-8111-111111111111";
const SID = "22222222-2222-4222-8222-222222222222";
const KEY = `${PID}/k.pdf`;

const del = (id: string) =>
  DELETE(new NextRequest(`https://askwell.test/api/knowledge/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  for (const c of [owner, service]) {
    c.state.calls = [];
    c.state.results = [];
    c.create.mockClear();
  }
  userId.value = "user_a";
  removeObjects.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("DELETE /api/knowledge/:id", () => {
  it("checks ownership with the owner client, deletes with the service client, then removes the file", async () => {
    owner.state.results.push({ data: { id: SID, project_id: PID, storage_key: KEY }, error: null });
    service.state.results.push({ data: [{ storage_key: KEY }], error: null });

    const res = await del(SID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(owner.state.calls).toEqual([
      ["from", "knowledge_sources"],
      ["select", "id, project_id, storage_key"],
      ["eq", "id", SID],
    ]);
    // Chunks go with the row (FK cascade).
    expect(service.state.calls).toEqual([
      ["from", "knowledge_sources"],
      ["delete"],
      ["eq", "id", SID],
      ["eq", "project_id", PID],
      ["select", "storage_key"],
    ]);
    expect(removeObjects).toHaveBeenCalledWith([KEY], `deleted source ${SID}`);
  });

  it("deletes pasted text without touching Storage", async () => {
    owner.state.results.push({ data: { id: SID, project_id: PID, storage_key: null }, error: null });
    service.state.results.push({ data: [{ storage_key: null }], error: null });
    expect((await del(SID)).status).toBe(200);
    expect(removeObjects).not.toHaveBeenCalled();
  });

  it("still answers ok when removing the file fails (removeObjects logs the key)", async () => {
    owner.state.results.push({ data: { id: SID, project_id: PID, storage_key: KEY }, error: null });
    service.state.results.push({ data: [{ storage_key: KEY }], error: null });
    removeObjects.mockResolvedValueOnce(false);
    expect((await del(SID)).status).toBe(200);
  });

  it("404 for another owner's source (RLS returns no row), deleting nothing", async () => {
    owner.state.results.push({ data: null, error: null });
    const res = await del(SID);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "Knowledge source not found." } });
    expect(service.create).not.toHaveBeenCalled();
    expect(removeObjects).not.toHaveBeenCalled();
  });

  it("404 when a concurrent delete got there first, removing no file", async () => {
    owner.state.results.push({ data: { id: SID, project_id: PID, storage_key: KEY }, error: null });
    service.state.results.push({ data: [], error: null });
    expect((await del(SID)).status).toBe(404);
    expect(removeObjects).not.toHaveBeenCalled();
  });

  it("500 when the delete fails, keeping the file", async () => {
    owner.state.results.push({ data: { id: SID, project_id: PID, storage_key: KEY }, error: null });
    service.state.results.push({ data: null, error: { message: "boom" } });
    const res = await del(SID);
    expect(res.status).toBe(500);
    expect((await res.json()).error.message).toBe("Something went wrong.");
    expect(removeObjects).not.toHaveBeenCalled();
  });

  it("400 for a bad id", async () => {
    expect((await del("nope")).status).toBe(400);
    expect(owner.create).not.toHaveBeenCalled();
  });

  it("401 when signed out", async () => {
    userId.value = null;
    expect((await del(SID)).status).toBe(401);
    expect(owner.create).not.toHaveBeenCalled();
  });
});
