import { visitorIdSchema } from "@askwell/shared";

export const VISITOR_ID_STORAGE_KEY = "askwell.visitorId";

type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

let memoryId: string | null = null;

/** 24 random URL-safe characters (matches `visitorIdSchema`). */
export function newVisitorId(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The visitor's ID from the iframe's localStorage, created on first visit and
 * reused after. If storage is unavailable or throws (private mode, blocked
 * third-party storage), falls back to an ID kept in memory for this page.
 */
export function getVisitorId(storage: () => KeyValueStorage | null | undefined): string {
  try {
    const store = storage();
    if (store) {
      const saved = store.getItem(VISITOR_ID_STORAGE_KEY);
      if (saved && visitorIdSchema.safeParse(saved).success) return saved;
      const id = newVisitorId();
      store.setItem(VISITOR_ID_STORAGE_KEY, id);
      return id;
    }
  } catch {
    // fall through to memory
  }
  memoryId ??= newVisitorId();
  return memoryId;
}

/** Test helper: forget the in-memory fallback ID. */
export function resetMemoryVisitorId(): void {
  memoryId = null;
}
