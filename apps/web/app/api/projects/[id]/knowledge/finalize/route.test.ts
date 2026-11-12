import { readFile } from "node:fs/promises";
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
  downloadObject: vi.fn<(key: string) => Promise<Uint8Array | null>>(),
  removeObjects: vi.fn(async () => true),
}));
const processSource = vi.hoisted(() => vi.fn());

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
vi.mock("../../../../../../lib/knowledge/process", () => ({ processSource }));
// extractText is real: the PDF fixture goes through unpdf.

const { POST, maxDuration } = await import("./route");
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
const claimed = (type: "pdf" | "md" | "txt") => ({
  id: SID,
  project_id: PID,
  title: "Manual",
  type,
  status: "processing",
  created_at: "2026-11-12T10:00:00+00:00",
  storage_key: `${PID}/k.${type}`,
});
const HELLO_PDF = new Uint8Array(await readFile(new URL("../../../../../../lib/knowledge/fixtures/hello.pdf", import.meta.url)));
const utf8 = (s: string) => new TextEncoder().encode(s);

const post = (id: string, body: unknown) =>
  POST(
    new NextRequest(`https://askwell.test/api/projects/${id}/knowledge/finalize`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

/** The gate passes and the claim returns `row` (null: nothing claimed). */
function claim(row: ReturnType<typeof claimed> | null) {
  owner.state.results.push({ data: PROJECT, error: null });
  service.state.results.push({ data: row, error: null });
}

/** The service calls after the claim (`from … maybeSingle` is the claim). */
const afterClaim = () => service.state.calls.slice(service.state.calls.findIndex((c) => c[0] === "select") + 1);

beforeEach(() => {
  for (const c of [owner, service]) {
    c.state.calls = [];
    c.state.results = [];
    c.create.mockClear();
  }
  userId.value = "user_a";
  storage.downloadObject.mockReset();
  storage.removeObjects.mockClear();
  processSource.mockReset();
  processSource.mockResolvedValue({ status: "ready", chunkCount: 1 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/projects/:id/knowledge/finalize", () => {
  it("allows time for inline processing", () => {
    expect(maxDuration).toBe(60);
  });

  it("claims the upload once, checks the PDF, extracts it and processes it", async () => {
    claim(claimed("pdf"));
    storage.downloadObject.mockResolvedValue(HELLO_PDF);

    const res = await post(PID, { sourceId: SID });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      source: { id: SID, projectId: PID, title: "Manual", type: "pdf", status: "ready", createdAt: "2026-11-12T10:00:00+00:00" },
    });
    // The claim: only an `uploading` row of this project moves to `processing`.
    expect(service.state.calls).toEqual([
      ["from", "knowledge_sources"],
      ["update", { status: "processing" }],
      ["eq", "id", SID],
      ["eq", "project_id", PID],
      ["eq", "status", "uploading"],
      ["select", "id, project_id, title, type, status, created_at, storage_key"],
    ]);
    expect(storage.downloadObject).toHaveBeenCalledWith(`${PID}/k.pdf`);
    expect(processSource).toHaveBeenCalledWith({ projectId: PID, sourceId: SID, text: "Askwell refunds take 5 days." });
    expect(storage.removeObjects).not.toHaveBeenCalled();
  });

  it("processes Markdown and TXT as UTF-8 text", async () => {
    for (const type of ["md", "txt"] as const) {
      claim(claimed(type));
      storage.downloadObject.mockResolvedValueOnce(utf8("# Refunds\n\n5 days."));
      expect((await post(PID, { sourceId: SID })).status).toBe(200);
    }
    expect(processSource).toHaveBeenCalledTimes(2);
    expect(processSource).toHaveBeenLastCalledWith({ projectId: PID, sourceId: SID, text: "# Refunds\n\n5 days." });
  });

  it("returns the source as failed when processing fails, keeping the file", async () => {
    claim(claimed("pdf"));
    storage.downloadObject.mockResolvedValue(HELLO_PDF);
    processSource.mockResolvedValue({ status: "failed" });
    const res = await post(PID, { sourceId: SID });
    expect(res.status).toBe(200);
    expect((await res.json()).source.status).toBe("failed");
    expect(storage.removeObjects).not.toHaveBeenCalled();
  });

  it("404 on a second finalize (the claim matches nothing), touching no file", async () => {
    claim(null);
    const res = await post(PID, { sourceId: SID });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
    expect(storage.downloadObject).not.toHaveBeenCalled();
    expect(processSource).not.toHaveBeenCalled();
  });

  describe("refuses the file, deleting it and its source", () => {
    async function expectRefused(message: RegExp) {
      const res = await post(PID, { sourceId: SID });
      expect(res.status).toBe(400);
      const { error } = await res.json();
      expect(error.code).toBe("validation");
      expect(error.message).toMatch(message);
      expect(afterClaim()).toEqual([
        ["from", "knowledge_sources"],
        ["delete"],
        ["eq", "id", SID],
        ["eq", "project_id", PID],
      ]);
      expect(processSource).not.toHaveBeenCalled();
    }

    it("a renamed .exe uploaded as .pdf (wrong magic bytes)", async () => {
      claim(claimed("pdf"));
      storage.downloadObject.mockResolvedValue(new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00])); // "MZ…"
      await expectRefused(/isn't a valid PDF/);
      expect(storage.removeObjects).toHaveBeenCalledWith([`${PID}/k.pdf`], "refused upload");
    });

    it("a PDF header later in the file doesn't count", async () => {
      claim(claimed("pdf"));
      storage.downloadObject.mockResolvedValue(utf8("junk%PDF-1.4"));
      await expectRefused(/isn't a valid PDF/);
    });

    it("a real file over 10 MB (the declared size lied)", async () => {
      claim(claimed("txt"));
      storage.downloadObject.mockResolvedValue(new Uint8Array(10 * 1024 * 1024 + 1).fill(0x61));
      await expectRefused(/10 MB/);
      expect(storage.removeObjects).toHaveBeenCalledWith([`${PID}/k.txt`], "refused upload");
    });

    it("an empty file", async () => {
      claim(claimed("md"));
      storage.downloadObject.mockResolvedValue(new Uint8Array());
      await expectRefused(/10 MB/);
    });

    it("binary bytes uploaded as .txt (not UTF-8)", async () => {
      claim(claimed("txt"));
      storage.downloadObject.mockResolvedValue(new Uint8Array([0x4d, 0x5a, 0xff, 0xfe, 0x00]));
      await expectRefused(/not valid UTF-8/);
    });

    it("a PDF with no readable text", async () => {
      claim(claimed("pdf"));
      storage.downloadObject.mockResolvedValue(new Uint8Array(await readFile(new URL("../../../../../../lib/knowledge/fixtures/blank.pdf", import.meta.url))));
      await expectRefused(/no text/);
    });

    it("an upload that never arrived", async () => {
      claim(claimed("pdf"));
      storage.downloadObject.mockResolvedValue(null);
      await expectRefused(/didn't finish uploading/);
    });
  });

  it("marks the source failed (keeping it) when the download errors", async () => {
    claim(claimed("pdf"));
    storage.downloadObject.mockRejectedValue(new Error("storage down"));
    const res = await post(PID, { sourceId: SID });
    expect(res.status).toBe(500);
    expect(afterClaim()).toEqual([
      ["from", "knowledge_sources"],
      ["update", { status: "failed" }],
      ["eq", "id", SID],
      ["eq", "project_id", PID],
    ]);
    expect(storage.removeObjects).not.toHaveBeenCalled();
  });

  it("404 for another owner's project, touching nothing", async () => {
    owner.state.results.push({ data: null, error: null });
    expect((await post(PID, { sourceId: SID })).status).toBe(404);
    expect(service.create).not.toHaveBeenCalled();
  });

  it.each([
    ["a bad source id", { sourceId: "nope" }],
    ["no source id", {}],
    ["invalid JSON", "{oops"],
  ])("400 for %s, claiming nothing", async (_, body) => {
    owner.state.results.push({ data: PROJECT, error: null });
    expect((await post(PID, body)).status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("401 when signed out", async () => {
    userId.value = null;
    expect((await post(PID, { sourceId: SID })).status).toBe(401);
    expect(owner.create).not.toHaveBeenCalled();
  });
});
