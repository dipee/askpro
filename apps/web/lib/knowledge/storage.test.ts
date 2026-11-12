import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** A fake `storage.from(bucket)` API that records calls. */
const bucket = vi.hoisted(() => ({
  createSignedUploadUrl: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
}));
const from = vi.hoisted(() => vi.fn(() => bucket));
vi.mock("../supabase/service", () => ({ createServiceClient: () => ({ storage: { from } }) }));

const { KNOWLEDGE_BUCKET, newStorageKey, createUploadUrl, downloadObject, removeObjects } = await import("./storage");

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

  it.each([
    ["a 404 status", { status: 404, message: "x" }],
    ["statusCode 404 in the body (Storage's HTTP 400)", { status: 400, statusCode: "404", message: "x" }],
    ["an 'Object not found' message", { message: "Object not found" }],
  ])("returns null for a missing object: %s", async (_, error) => {
    bucket.download.mockResolvedValue({ data: null, error });
    await expect(downloadObject("k")).resolves.toBeNull();
  });

  it("throws on other errors (a bare 400 isn't 'missing')", async () => {
    bucket.download.mockResolvedValue({ data: null, error: { status: 400, message: "bad request" } });
    await expect(downloadObject("k")).rejects.toThrow("bad request");
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
