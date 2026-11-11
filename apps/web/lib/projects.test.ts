import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const state = { result: { data: null as unknown, error: null as { message: string } | null }, calls: [] as unknown[][] };
  const builder: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq"]) {
    builder[m] = (...a: unknown[]) => (state.calls.push([m, ...a]), builder);
  }
  builder.maybeSingle = async () => state.result;
  return { state, builder };
});
const userId = vi.hoisted(() => ({ value: "user_a" as string | null }));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: userId.value }) }));
vi.mock("./supabase/owner", () => ({ createOwnerClient: () => db.builder }));

const { currentUserId, getOwnedProject, projectFromRow, readJsonBody } = await import("./projects");

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Help desk",
  public_key: "pk_abc",
  messages_used: 3,
  period_start: "2026-11-01T00:00:00+00:00",
  created_at: "2026-11-11T10:00:00+00:00",
};

beforeEach(() => {
  db.state.calls = [];
  db.state.result = { data: null, error: null };
  userId.value = "user_a";
});

describe("projectFromRow", () => {
  it("maps snake_case columns to the shared Project", () => {
    expect(projectFromRow(ROW)).toEqual({
      id: ROW.id,
      name: "Help desk",
      publicKey: "pk_abc",
      messagesUsed: 3,
      periodStart: ROW.period_start,
      createdAt: ROW.created_at,
    });
  });
});

describe("getOwnedProject", () => {
  it("reads by id with the owner client and returns the project", async () => {
    db.state.result = { data: ROW, error: null };
    expect(await getOwnedProject(ROW.id)).toMatchObject({ id: ROW.id, publicKey: "pk_abc" });
    expect(db.state.calls).toContainEqual(["from", "projects"]);
    expect(db.state.calls).toContainEqual(["eq", "id", ROW.id]);
  });

  it("returns null when RLS hides it (missing or another owner's)", async () => {
    expect(await getOwnedProject(ROW.id)).toBeNull();
  });

  it("throws on a database error", async () => {
    db.state.result = { data: null, error: { message: "boom" } };
    await expect(getOwnedProject(ROW.id)).rejects.toThrow("boom");
  });

  it("never selects owner_id", async () => {
    db.state.result = { data: ROW, error: null };
    await getOwnedProject(ROW.id);
    expect(String(db.state.calls.find((c) => c[0] === "select")?.[1])).not.toContain("owner_id");
  });
});

describe("currentUserId", () => {
  it("returns Clerk's user ID, or null when signed out", async () => {
    expect(await currentUserId()).toBe("user_a");
    userId.value = null;
    expect(await currentUserId()).toBeNull();
  });
});

describe("readJsonBody", () => {
  it("parses JSON and returns undefined for a bad body", async () => {
    const req = (body: string) => new Request("https://x.test", { method: "POST", body });
    expect(await readJsonBody(req('{"name":"A"}'))).toEqual({ name: "A" });
    expect(await readJsonBody(req("{oops"))).toBeUndefined();
  });
});
