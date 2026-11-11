import { visitorIdSchema } from "@askwell/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { getVisitorId, newVisitorId, resetMemoryVisitorId, VISITOR_ID_STORAGE_KEY } from "./visitor-id";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

beforeEach(() => resetMemoryVisitorId());

describe("newVisitorId", () => {
  it("matches visitorIdSchema and is random", () => {
    const ids = new Set(Array.from({ length: 50 }, newVisitorId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(visitorIdSchema.safeParse(id).success).toBe(true);
  });
});

describe("getVisitorId", () => {
  it("creates an ID on first visit and reuses it after", () => {
    const store = memoryStorage();
    const first = getVisitorId(() => store);
    expect(store.data.get(VISITOR_ID_STORAGE_KEY)).toBe(first);
    expect(getVisitorId(() => store)).toBe(first);
  });

  it("replaces a stored value that isn't a valid ID", () => {
    const store = memoryStorage({ [VISITOR_ID_STORAGE_KEY]: "<script>" });
    const id = getVisitorId(() => store);
    expect(id).not.toBe("<script>");
    expect(visitorIdSchema.safeParse(id).success).toBe(true);
  });

  it("falls back to an in-memory ID when storage throws", () => {
    const throwing = () => {
      throw new DOMException("denied", "SecurityError");
    };
    const a = getVisitorId(throwing);
    const b = getVisitorId(() => ({
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
    }));
    expect(visitorIdSchema.safeParse(a).success).toBe(true);
    expect(b).toBe(a);
  });
});
