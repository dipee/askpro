import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabasePglite, type ApiRole, type SupabasePglite } from "../supabase-pglite";
import { PG, expectPgError, expectRaise, functionSecurity } from "./fixtures";

let pg: SupabasePglite;

beforeAll(async () => {
  pg = await createSupabasePglite();
});
afterAll(() => pg?.close());

interface Activity {
  id: string;
  visitor_id: string;
  created_at: Date;
  preview: string | null;
  message_count: number;
}

let n = 0;
async function newOwner() {
  const sub = `user_oa_${++n}`;
  await pg.db.query("insert into public.accounts (clerk_user_id) values ($1)", [sub]);
  const { rows } = await pg.db.query<{ id: string }>(
    "insert into public.projects (owner_id, name) values ($1, 'P') returning id",
    [sub],
  );
  return { sub, projectId: rows[0].id };
}

/** A conversation `minutesAgo` old, with messages saved in order (as the superuser). */
async function conversation(
  projectId: string,
  minutesAgo: number,
  messages: { role: "visitor" | "bot"; body: string }[] = [],
) {
  const { rows } = await pg.db.query<{ id: string }>(
    `insert into public.conversations (project_id, visitor_id, created_at)
     values ($1, 'visitor_0001', now() - make_interval(mins => $2)) returning id`,
    [projectId, minutesAgo],
  );
  const id = rows[0].id;
  // Explicit, increasing created_at (1 s apart): pglite's clock_timestamp() has only
  // millisecond resolution, so back-to-back inserts can tie and the id tiebreak is random.
  for (const [i, m] of messages.entries()) {
    await pg.db.query(
      `insert into public.messages (conversation_id, role, body, created_at)
       values ($1, $2, $3, now() - make_interval(mins => $4) + make_interval(secs => $5))`,
      [id, m.role, m.body, minutesAgo, i + 1],
    );
  }
  return id;
}

function activity(
  role: ApiRole,
  sub: string | null,
  projectId: string,
  page: { limit?: number; offset?: number } = {},
) {
  return pg.as(role, sub, async (s) => {
    const sql =
      page.limit === undefined && page.offset === undefined
        ? "select * from public.owner_activity($1)"
        : "select * from public.owner_activity($1, $2, $3)";
    const params = sql.includes("$2") ? [projectId, page.limit ?? 50, page.offset ?? 0] : [projectId];
    return (await s.query<Activity>(sql, params)).rows;
  });
}

describe("owner_activity", () => {
  it("returns the owner's conversations newest first, with preview and count", async () => {
    const a = await newOwner();
    const older = await conversation(a.projectId, 30, [
      { role: "visitor", body: "Do you ship to Canada?" },
      { role: "bot", body: "Yes, we do." },
      { role: "visitor", body: "Thanks" },
      { role: "bot", body: "Welcome!" },
    ]);
    const newest = await conversation(a.projectId, 1, [
      { role: "visitor", body: "Hello" },
      { role: "bot", body: "Hi there" },
    ]);
    const middle = await conversation(a.projectId, 10);

    const rows = await activity("authenticated", a.sub, a.projectId);
    expect(rows.map((r) => [r.id, r.visitor_id, r.preview, r.message_count])).toEqual([
      [newest, "visitor_0001", "Hello", 2],
      [middle, "visitor_0001", null, 0],
      [older, "visitor_0001", "Do you ship to Canada?", 4],
    ]);
    expect(rows[0].created_at.getTime()).toBeGreaterThan(rows[1].created_at.getTime());
  });

  it("previews the first visitor message, not a bot one, cut to 140 characters", async () => {
    const a = await newOwner();
    const long = "x".repeat(139) + "yz";
    await conversation(a.projectId, 1, [
      { role: "bot", body: "Welcome! How can I help?" },
      { role: "visitor", body: long },
      { role: "visitor", body: "Second" },
    ]);
    const [row] = await activity("authenticated", a.sub, a.projectId);
    expect(row.preview).toBe("x".repeat(139) + "y");
    expect(row.preview).toHaveLength(140);
    expect(row.message_count).toBe(3);
  });

  it("returns no rows for another owner's project", async () => {
    const a = await newOwner();
    const b = await newOwner();
    await conversation(b.projectId, 1, [{ role: "visitor", body: "Secret" }]);

    expect(await activity("authenticated", a.sub, b.projectId)).toEqual([]);
    expect(await activity("authenticated", null, b.projectId)).toHaveLength(0);
    expect(await activity("authenticated", b.sub, b.projectId)).toHaveLength(1);
  });

  it("pages with limit and offset, without overlap", async () => {
    const a = await newOwner();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push(await conversation(a.projectId, i));

    const first = await activity("authenticated", a.sub, a.projectId, { limit: 2 });
    const second = await activity("authenticated", a.sub, a.projectId, { limit: 2, offset: 2 });
    const last = await activity("authenticated", a.sub, a.projectId, { limit: 2, offset: 4 });
    expect([...first, ...second, ...last].map((r) => r.id)).toEqual(ids);
  });

  it("defaults to 50 rows per page", async () => {
    const a = await newOwner();
    await pg.db.query(
      `insert into public.conversations (project_id, visitor_id, created_at)
       select $1, 'visitor_0001', now() - make_interval(secs => g) from generate_series(1, 51) g`,
      [a.projectId],
    );
    expect(await activity("authenticated", a.sub, a.projectId)).toHaveLength(50);
  });

  it.each([
    { limit: 0, offset: 0 },
    { limit: 101, offset: 0 },
    { limit: 10, offset: -1 },
  ])("refuses a bad page %o", async (page) => {
    const a = await newOwner();
    await expectRaise(activity("authenticated", a.sub, a.projectId, page), "22023", "invalid_page");
  });

  it("anon can't execute it", async () => {
    const a = await newOwner();
    await expectPgError(activity("anon", null, a.projectId), PG.insufficientPrivilege);
  });

  it("is SECURITY INVOKER, search_path='', executable by authenticated and service_role only", async () => {
    const sec = await functionSecurity(pg, "public.owner_activity(uuid, int, int)");
    expect(sec.can).toEqual([
      { role: "anon", can: false },
      { role: "authenticated", can: true },
      { role: "service_role", can: true },
    ]);
    expect(sec.acl).not.toMatch(/(^|[{,])=X/); // no PUBLIC grant
    expect(sec.secdef).toBe(false);
    expect(sec.config).toEqual(['search_path=""']);
  });
});
