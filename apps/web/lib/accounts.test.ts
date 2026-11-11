import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { clerk_user_id: string; plan: string; created_at: string };
type DbError = { message: string } | null;

// In-memory stand-in for `public.accounts`, keyed by Clerk user ID.
const db = vi.hoisted(() => ({
  rows: new Map<string, Row>(),
  readError: null as DbError,
  insertError: null as DbError,
}));
const authFn = vi.hoisted(() => vi.fn(async (): Promise<{ userId: string | null }> => ({ userId: "user_1" })));
const upsert = vi.hoisted(() => vi.fn());
const ownerFrom = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: authFn }));

// Owner client: RLS returns only the caller's row. Like Next.js's fetch
// memoization within one render, a read without its own AbortSignal reuses the
// previous read's result.
const memo = vi.hoisted(() => ({ last: null as { data: Row | null; error: DbError } | null }));
vi.mock("./supabase/owner", () => ({
  createOwnerClient: () => ({
    from: (table: string) => {
      ownerFrom(table);
      let signal: AbortSignal | undefined;
      const query = {
        abortSignal: (s: AbortSignal) => {
          signal = s;
          return query;
        },
        maybeSingle: async () => {
          if (!signal && memo.last) return memo.last;
          await Promise.resolve();
          if (db.readError) return { data: null, error: db.readError };
          const { userId } = await authFn();
          const result = { data: (userId && db.rows.get(userId)) || null, error: null };
          if (!signal) memo.last = result;
          return result;
        },
      };
      return { select: () => query };
    },
  }),
}));

// Service client: upsert with ON CONFLICT DO NOTHING semantics.
vi.mock("./supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({
      upsert: async (row: Row, opts: { onConflict: string; ignoreDuplicates: boolean }) => {
        upsert(row, opts);
        await Promise.resolve();
        if (db.insertError) return { error: db.insertError };
        if (!db.rows.has(row.clerk_user_id) || !opts.ignoreDuplicates) {
          db.rows.set(row.clerk_user_id, { ...row, created_at: "2026-11-11T00:00:00Z" });
        }
        return { error: null };
      },
    }),
  }),
}));

const { ensureAccount, UnauthorizedError } = await import("./accounts");

beforeEach(() => {
  memo.last = null;
  db.rows.clear();
  db.readError = null;
  db.insertError = null;
  upsert.mockClear();
  ownerFrom.mockClear();
  authFn.mockImplementation(async () => ({ userId: "user_1" }));
});

describe("ensureAccount", () => {
  it("creates a free account for a new user", async () => {
    const account = await ensureAccount();

    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert).toHaveBeenCalledWith(
      { clerk_user_id: "user_1", plan: "free" },
      { onConflict: "clerk_user_id", ignoreDuplicates: true },
    );
    expect(account).toEqual({ clerkUserId: "user_1", plan: "free", createdAt: "2026-11-11T00:00:00Z" });
    expect(db.rows.size).toBe(1);
  });

  it("returns an existing account without inserting", async () => {
    db.rows.set("user_1", { clerk_user_id: "user_1", plan: "pro", created_at: "2026-01-01T00:00:00Z" });

    const account = await ensureAccount();

    expect(upsert).not.toHaveBeenCalled();
    expect(account.plan).toBe("pro");
    expect(ownerFrom).toHaveBeenCalledWith("accounts");
  });

  it("throws UnauthorizedError without a session and touches no database", async () => {
    authFn.mockImplementation(async () => ({ userId: null }));

    await expect(ensureAccount()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(ownerFrom).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("handles concurrent first visits without error or duplicates", async () => {
    const results = await Promise.all([ensureAccount(), ensureAccount(), ensureAccount()]);

    expect(results.map((a) => a.plan)).toEqual(["free", "free", "free"]);
    expect(db.rows.size).toBe(1);
    for (const [, opts] of upsert.mock.calls) {
      expect(opts).toEqual({ onConflict: "clerk_user_id", ignoreDuplicates: true });
    }
  });

  it("keeps a row created in between (e.g. by the webhook as pro)", async () => {
    upsert.mockImplementationOnce(() => {
      db.rows.set("user_1", { clerk_user_id: "user_1", plan: "pro", created_at: "2026-01-01T00:00:00Z" });
    });

    const account = await ensureAccount();

    expect(account.plan).toBe("pro");
  });

  it("only ever uses the user ID from auth()", async () => {
    authFn.mockImplementation(async () => ({ userId: "user_from_clerk" }));

    await ensureAccount();

    expect(upsert.mock.calls[0]![0]).toEqual({ clerk_user_id: "user_from_clerk", plan: "free" });
  });

  it("surfaces read and insert errors", async () => {
    db.readError = { message: "boom" };
    await expect(ensureAccount()).rejects.toThrow("Reading the account failed: boom");

    db.readError = null;
    db.insertError = { message: "nope" };
    await expect(ensureAccount()).rejects.toThrow("Creating the account failed: nope");
  });

  it("rejects an unknown plan value", async () => {
    db.rows.set("user_1", { clerk_user_id: "user_1", plan: "gold", created_at: "x" });
    await expect(ensureAccount()).rejects.toThrow();
  });
});
