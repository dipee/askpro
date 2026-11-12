import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** A fake `storage.from(bucket)` API that records calls. */
const bucket = vi.hoisted(() => ({
  createSignedUploadUrl: vi.fn(),
  download: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
}));
const from = vi.hoisted(() => vi.fn(() => bucket));
vi.mock("../supabase/service", () => ({ createServiceClient: () => ({ storage: { from } }) }));

const { KNOWLEDGE_BUCKET, newStorageKey, createUploadUrl, downloadObject, listProjectKeys, removeObjects, removeProjectFiles } =
  await import("./storage");

const PID = "11111111-1111-4111-8111-111111111111";
let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  from.mockClear();
  for (const f of Object.values(bucket)) f.mockReset();
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("newStorageKey", () => {
  it("is <projectId>/<random uuid>.<ext>, different every time", () => {
    const a = newStorageKey(PID, "pdf");
    expect(a).toMatch(new RegExp(`^${PID}/[0-9a-f-]{36}\\.pdf$`));
    expect(newStorageKey(PID, "pdf")).not.toBe(a);
  });
});

describe("createUploadUrl", () => {
  it("signs an upload in the knowledge bucket, without upsert", async () => {
    bucket.createSignedUploadUrl.mockResolvedValue({ data: { signedUrl: "https://s/u?token=t", token: "t", path: "k" }, error: null });
    await expect(createUploadUrl("k")).resolves.toEqual({ uploadUrl: "https://s/u?token=t", token: "t" });
    expect(from).toHaveBeenCalledWith(KNOWLEDGE_BUCKET);
    expect(KNOWLEDGE_BUCKET).toBe("knowledge");
    expect(bucket.createSignedUploadUrl).toHaveBeenCalledWith("k");
  });

  it("throws on a Storage error", async () => {
    bucket.createSignedUploadUrl.mockResolvedValue({ data: null, error: { message: "denied" } });
    await expect(createUploadUrl("k")).rejects.toThrow("denied");
  });
});

describe("downloadObject", () => {
  it("returns the bytes", async () => {
    bucket.download.mockResolvedValue({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null });
    await expect(downloadObject("k")).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });

  // Shapes as dev Storage returns them (checked against the real bucket).
  it("returns null for a missing object (code NoSuchKey)", async () => {
    bucket.download.mockResolvedValue({
      data: null,
      error: { name: "StorageApiError", status: 400, statusCode: "404", code: "NoSuchKey", message: "Object not found" },
    });
    await expect(downloadObject("k")).resolves.toBeNull();
  });

  it.each([
    ["a missing bucket (same 404 shape, code NoSuchBucket)", { status: 400, statusCode: "404", code: "NoSuchBucket", message: "Bucket not found" }],
    ["a missing tenant", { status: 400, statusCode: "404", code: "TenantNotFound", message: "Tenant not found" }],
    ["any other error", { status: 400, message: "bad request" }],
  ])("throws, not null, for %s", async (_, error) => {
    bucket.download.mockResolvedValue({ data: null, error });
    await expect(downloadObject("k")).rejects.toThrow(error.message);
  });
});

describe("listProjectKeys", () => {
  it("lists every key under the project's folder, page by page", async () => {
    const page = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ name: `f${from + i}.pdf` }));
    bucket.list.mockResolvedValueOnce({ data: page(1000), error: null }).mockResolvedValueOnce({ data: page(2, 1000), error: null });
    const keys = await listProjectKeys(PID);
    expect(keys).toHaveLength(1002);
    expect(keys[1001]).toBe(`${PID}/f1001.pdf`);
    expect(bucket.list).toHaveBeenNthCalledWith(1, PID, { limit: 1000, offset: 0 });
    expect(bucket.list).toHaveBeenNthCalledWith(2, PID, { limit: 1000, offset: 1000 });
  });
});

describe("removeProjectFiles", () => {
  it("also removes a file whose source was reserved after the keys were read", async () => {
    // The route read [a.pdf]; meanwhile an upload reserved late.md, and the cascade
    // deleted its row with the project. Only the folder listing knows about it.
    bucket.list.mockResolvedValue({ data: [{ name: "a.pdf" }, { name: "late.md" }], error: null });
    bucket.remove.mockResolvedValue({ data: [], error: null });
    await expect(removeProjectFiles(PID, [`${PID}/a.pdf`])).resolves.toBe(true);
    expect(bucket.remove).toHaveBeenCalledWith([`${PID}/a.pdf`, `${PID}/late.md`]);
  });

  it("removes the known keys when listing fails", async () => {
    bucket.list.mockResolvedValue({ data: null, error: { message: "list down" } });
    bucket.remove.mockResolvedValue({ data: [], error: null });
    await expect(removeProjectFiles(PID, [`${PID}/a.pdf`])).resolves.toBe(true);
    expect(bucket.remove).toHaveBeenCalledWith([`${PID}/a.pdf`]);
    expect(errorLog).toHaveBeenCalledWith("Knowledge storage list failed; removing the known keys only", {
      projectId: PID,
      error: "Listing the project's files failed: list down",
    });
  });
});

describe("removeObjects", () => {
  it("removes unique, non-empty keys in one call", async () => {
    bucket.remove.mockResolvedValue({ data: [], error: null });
    await expect(removeObjects(["a", "b", "a", ""], "test")).resolves.toBe(true);
    expect(bucket.remove).toHaveBeenCalledWith(["a", "b"]);
  });

  it("does nothing for no keys", async () => {
    await expect(removeObjects([], "test")).resolves.toBe(true);
    expect(from).not.toHaveBeenCalled();
  });

  it("logs the keys for retry and returns false on an error, never throwing", async () => {
    bucket.remove.mockResolvedValue({ data: null, error: { message: "storage down" } });
    await expect(removeObjects(["a"], "deleted source s1")).resolves.toBe(false);
    expect(errorLog).toHaveBeenCalledWith("Knowledge storage remove failed; retry these keys", {
      reason: "deleted source s1",
      keys: ["a"],
      error: "storage down",
    });
  });

  it("returns false when the call itself rejects", async () => {
    bucket.remove.mockRejectedValue(new Error("network"));
    await expect(removeObjects(["a"], "x")).resolves.toBe(false);
  });
});
