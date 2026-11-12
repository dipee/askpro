import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(async () => {
  const { fakeClient } = await import("../../../test-db");
  return {
    owner: fakeClient("owner"),
    service: fakeClient("service"),
    userId: { value: "user_a" as string | null },
  };
});
const storage = vi.hoisted(() => ({
  newStorageKey: vi.fn((projectId: string, ext: string) => `${projectId}/k.${ext}`),
  createUploadUrl: vi.fn(),
  removeObjects: vi.fn(async () => true),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", async () => {
  const s = await h;
  return { auth: async () => ({ userId: s.userId.value }) };
});
vi.mock("../../../../../../lib/supabase/owner", async () => ({ createOwnerClient: (await h).owner.create }));
vi.mock("../../../../../../lib/supabase/service", async () => ({ createServiceClient: (await h).service.create }));
vi.mock("../../../../../../lib/accounts", () => ({
  ensureAccount: async () => ({ clerkUserId: "user_a", plan: "free", createdAt: "" }),
}));
vi.mock("../../../../../../lib/knowledge/storage", () => storage);

const { POST } = await import("./route");
const { owner, service, userId } = await h;

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
const reserved = (type: string) => ({
  id: SID,
  project_id: PID,
  title: "Manual",
  type,
  storage_key: `${PID}/k.${type}`,
  status: "uploading",
  created_at: "2026-11-12T10:00:00+00:00",
  reclaimed_keys: [] as string[],
});

const post = (id: string, body: unknown) =>
  POST(
    new NextRequest(`https://askwell.test/api/projects/${id}/knowledge/upload-url`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
const ok = { title: "Manual", fileName: "Manual.PDF", size: 1234 };

beforeEach(() => {
  for (const c of [owner, service]) {
    c.state.calls = [];
    c.state.results = [];
    c.create.mockClear();
  }
  userId.value = "user_a";
  storage.newStorageKey.mockClear();
  storage.createUploadUrl.mockReset();
  storage.createUploadUrl.mockResolvedValue({ uploadUrl: "https://storage.test/sign?token=t", token: "t" });
  storage.removeObjects.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/projects/:id/knowledge/upload-url", () => {
  it.each([
    ["Manual.PDF", "pdf"],
    ["notes.md", "md"],
    ["faq.txt", "txt"],
  ])("reserves %s as an uploading %s source and returns a signed URL", async (fileName, type) => {
    owner.state.results.push({ data: PROJECT, error: null });
    service.state.results.push({ data: [reserved(type)], error: null });

    const res = await post(PID, { ...ok, fileName });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      source: { id: SID, projectId: PID, title: "Manual", type, status: "uploading", createdAt: "2026-11-12T10:00:00+00:00" },
      uploadUrl: "https://storage.test/sign?token=t",
      token: "t",
    });
    expect(storage.newStorageKey).toHaveBeenCalledWith(PID, type);
    expect(service.state.calls).toEqual([
      [
        "rpc",
        "reserve_knowledge_source",
        {
          p_project_id: PID,
          p_title: "Manual",
          p_type: type,
          p_status: "uploading",
          p_limit: 3,
          p_storage_key: `${PID}/k.${type}`,
        },
      ],
    ]);
    expect(storage.createUploadUrl).toHaveBeenCalledWith(`${PID}/k.${type}`);
  });

  it("removes the files of stale uploads the reservation reclaimed", async () => {
    owner.state.results.push({ data: PROJECT, error: null });
    service.state.results.push({ data: [{ ...reserved("pdf"), reclaimed_keys: [`${PID}/old.pdf`] }], error: null });
    await post(PID, ok);
    expect(storage.removeObjects).toHaveBeenCalledWith([`${PID}/old.pdf`], "reclaimed stale uploads");
  });

  it.each([
    ["an .exe", { ...ok, fileName: "setup.exe" }],
    ["no extension", { ...ok, fileName: "README" }],
    ["a .pdf.exe", { ...ok, fileName: "manual.pdf.exe" }],
    ["a declared size over 10 MB", { ...ok, size: 10 * 1024 * 1024 + 1 }],
    ["a zero size", { ...ok, size: 0 }],
    ["a non-integer size", { ...ok, size: 1.5 }],
    ["no title", { ...ok, title: "" }],
    ["invalid JSON", "{oops"],
  ])("400 for %s, reserving nothing", async (_, body) => {
    owner.state.results.push({ data: PROJECT, error: null });
    const res = await post(PID, body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation");
    expect(service.create).not.toHaveBeenCalled();
    expect(storage.createUploadUrl).not.toHaveBeenCalled();
  });

  it("403 plan_limit at the limit, with no upload URL", async () => {
    owner.state.results.push({ data: PROJECT, error: null });
    service.state.results.push({ data: null, error: { message: "plan_limit", code: "P0001" } });
    const res = await post(PID, ok);
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("plan_limit");
    expect(storage.createUploadUrl).not.toHaveBeenCalled();
  });

  it("404 for another owner's project, touching nothing", async () => {
    owner.state.results.push({ data: null, error: null });
    expect((await post(PID, ok)).status).toBe(404);
    expect(service.create).not.toHaveBeenCalled();
    expect(storage.createUploadUrl).not.toHaveBeenCalled();
  });

  it("401 when signed out", async () => {
    userId.value = null;
    expect((await post(PID, ok)).status).toBe(401);
    expect(owner.create).not.toHaveBeenCalled();
  });

  it("frees the reservation when the signed URL can't be created", async () => {
    owner.state.results.push({ data: PROJECT, error: null });
    service.state.results.push({ data: [reserved("pdf")], error: null }, { data: null, error: null });
    storage.createUploadUrl.mockRejectedValue(new Error("storage down"));

    const res = await post(PID, ok);
    expect(res.status).toBe(500);
    expect(service.state.calls.slice(1)).toEqual([
      ["from", "knowledge_sources"],
      ["delete"],
      ["eq", "id", SID],
      ["eq", "project_id", PID],
    ]);
  });
});
