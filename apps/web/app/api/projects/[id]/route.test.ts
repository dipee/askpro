import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(async () => {
  const { fakeClient } = await import("../test-db");
  return { owner: fakeClient("owner"), service: fakeClient("service"), userId: { value: "user_a" as string | null } };
});

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", async () => {
  const s = await h;
  return { auth: async () => ({ userId: s.userId.value }) };
});
vi.mock("../../../../lib/supabase/owner", async () => ({ createOwnerClient: (await h).owner.create }));
vi.mock("../../../../lib/supabase/service", async () => ({ createServiceClient: (await h).service.create }));
const removeProjectFiles = vi.hoisted(() =>
  vi.fn<(projectId: string, knownKeys: readonly string[]) => Promise<boolean>>(async () => true),
);
vi.mock("../../../../lib/knowledge/storage", () => ({ removeProjectFiles }));

const { PATCH, DELETE } = await import("./route");
const { owner, service, userId } = await h;

const ID = "11111111-1111-4111-8111-111111111111";
const ROW = {
  id: ID,
  name: "Renamed",
  public_key: "pk_abc",
  messages_used: 0,
  period_start: "2026-11-01T00:00:00+00:00",
  created_at: "2026-11-11T10:00:00+00:00",
};

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const patch = (id: string, body: unknown) =>
  PATCH(
    new NextRequest(`https://askwell.test/api/projects/${id}`, {
      method: "PATCH",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    ctx(id),
  );
const del = (id: string) => DELETE(new NextRequest(`https://askwell.test/api/projects/${id}`, { method: "DELETE" }), ctx(id));

beforeEach(() => {
  for (const c of [owner, service]) {
    c.state.calls = [];
    c.state.results = [];
    c.create.mockClear();
  }
  userId.value = "user_a";
  removeProjectFiles.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PATCH /api/projects/:id", () => {
  it("renames through the owner client, updating only name", async () => {
    owner.state.results.push({ data: ROW, error: null });
    const res = await patch(ID, { name: " Renamed ", publicKey: "pk_mine", ownerId: "user_b" });
    expect(res.status).toBe(200);
    expect((await res.json()).project).toMatchObject({ id: ID, name: "Renamed" });
    expect(owner.state.calls).toContainEqual(["update", { name: "Renamed" }]);
    expect(owner.state.calls).toContainEqual(["eq", "id", ID]);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("404 for another owner's project (RLS returns no row)", async () => {
    owner.state.results.push({ data: null, error: null });
    const res = await patch(ID, { name: "Hijack" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "Project not found." } });
  });

  it.each([
    ["a bad id", "not-a-uuid", { name: "X" }],
    ["an empty name", ID, { name: "" }],
    ["a too-long name", ID, { name: "x".repeat(61) }],
    ["invalid JSON", ID, "{oops"],
  ])("400 for %s, before any database call", async (_, id, body) => {
    const res = await patch(id, body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation");
    expect(owner.create).not.toHaveBeenCalled();
  });

  it("401 when signed out", async () => {
    userId.value = null;
    expect((await patch(ID, { name: "X" })).status).toBe(401);
  });
});

describe("DELETE /api/projects/:id", () => {
  const FILES = { data: [{ storage_key: `${ID}/a.pdf` }, { storage_key: null }, { storage_key: `${ID}/b.md` }], error: null };

  it("reads the file keys, deletes through the owner client, then removes the files", async () => {
    owner.state.results.push(FILES, { data: [{ id: ID }], error: null });
    const res = await del(ID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(owner.state.calls).toEqual([
      ["from", "knowledge_sources"],
      ["select", "storage_key"],
      ["eq", "project_id", ID],
      ["from", "projects"],
      ["delete"],
      ["eq", "id", ID],
      ["select", "id"],
    ]);
    // Pasted text (null key) has no file.
    // The read keys, plus whatever else is in the project's folder (removeProjectFiles lists it).
    expect(removeProjectFiles).toHaveBeenCalledWith(ID, [`${ID}/a.pdf`, `${ID}/b.md`]);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("still answers ok when removing the files fails (it logs the keys)", async () => {
    owner.state.results.push(FILES, { data: [{ id: ID }], error: null });
    removeProjectFiles.mockResolvedValueOnce(false);
    expect((await del(ID)).status).toBe(200);
  });

  it("404 for another owner's project (RLS returns no keys and deletes nothing), removing no files", async () => {
    owner.state.results.push({ data: [], error: null }, { data: [], error: null });
    expect((await del(ID)).status).toBe(404);
    expect(removeProjectFiles).not.toHaveBeenCalled();
  });

  it("400 for a bad id", async () => {
    expect((await del("nope")).status).toBe(400);
    expect(owner.create).not.toHaveBeenCalled();
  });

  it("500 when reading the file keys fails, deleting nothing", async () => {
    owner.state.results.push({ data: null, error: { message: "boom" } });
    const res = await del(ID);
    expect(res.status).toBe(500);
    expect(owner.state.calls).not.toContainEqual(["delete"]);
    expect(removeProjectFiles).not.toHaveBeenCalled();
  });

  it("500 on a delete error, without leaking it or removing files", async () => {
    owner.state.results.push(FILES, { data: null, error: { message: "boom" } });
    const res = await del(ID);
    expect(res.status).toBe(500);
    expect((await res.json()).error.message).toBe("Something went wrong.");
    expect(removeProjectFiles).not.toHaveBeenCalled();
  });

  it("401 when signed out", async () => {
    userId.value = null;
    expect((await del(ID)).status).toBe(401);
  });
});
