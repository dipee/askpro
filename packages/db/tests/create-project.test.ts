import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabasePglite, type ApiRole, type SupabasePglite } from "../supabase-pglite";
import { PG, countRows, expectPgError } from "./fixtures";

let pg: SupabasePglite;

beforeAll(async () => {
  pg = await createSupabasePglite();
});
afterAll(() => pg?.close());

interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  public_key: string;
  messages_used: number;
}

let n = 0;
/** A fresh account, so each test starts with zero projects. */
async function newAccount() {
  const sub = `user_cp_${++n}`;
  await pg.db.query("insert into public.accounts (clerk_user_id) values ($1)", [sub]);
  return sub;
}

function createProject(owner: string, name: string, max: number | null, role: ApiRole = "service_role") {
  return pg.as(role, null, async (s) => {
    const { rows } = await s.query<ProjectRow>("select * from public.create_project($1, $2, $3)", [
      owner,
      name,
      max,
    ]);
    return rows[0];
  });
}

/** Expects a Postgres error with this code and message. */
async function expectRaise(promise: Promise<unknown>, code: string, message: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e as { code?: string; message?: string },
  );
  expect(error, `expected ${message}, but the call succeeded`).not.toBeNull();
  expect({ code: error?.code, message: error?.message }).toEqual({ code, message });
}

describe("create_project", () => {
  it("creates the project with a pk_ key and its default widget config", async () => {
    const owner = await newAccount();
    const project = await createProject(owner, "Help desk", 1);

    expect(project).toMatchObject({ owner_id: owner, name: "Help desk", messages_used: 0 });
    expect(project.public_key).toMatch(/^pk_[A-Za-z0-9_-]{1,64}$/);
    expect(await countRows(pg, "projects", "id = $1", [project.id])).toBe(1);
    expect(await countRows(pg, "widget_configs", "project_id = $1", [project.id])).toBe(1);
  });

  it("allows creates up to the limit it is given, then refuses with plan_limit", async () => {
    const owner = await newAccount();
    for (let i = 1; i <= 5; i++) await createProject(owner, `P${i}`, 5);
    await expectRaise(createProject(owner, "P6", 5), "P0001", "plan_limit");
    expect(await countRows(pg, "projects", "owner_id = $1", [owner])).toBe(5);
  });

  it("refuses at the limit without leaving a project or widget config behind", async () => {
    const owner = await newAccount();
    await createProject(owner, "First", 1);
    const before = await countRows(pg, "widget_configs");
    await expectRaise(createProject(owner, "Second", 1), "P0001", "plan_limit");
    expect(await countRows(pg, "projects", "owner_id = $1", [owner])).toBe(1);
    expect(await countRows(pg, "widget_configs")).toBe(before);
  });

  it("counts only the caller's own projects", async () => {
    const a = await newAccount();
    const b = await newAccount();
    await createProject(a, "A's", 1);
    await expect(createProject(b, "B's", 1)).resolves.toMatchObject({ owner_id: b });
  });

  it("refuses a limit of 0, a negative limit and a null limit", async () => {
    const owner = await newAccount();
    await expectRaise(createProject(owner, "P", 0), "P0001", "plan_limit");
    await expectRaise(createProject(owner, "P", -1), "22023", "invalid_max_projects");
    await expectRaise(createProject(owner, "P", null), "22023", "invalid_max_projects");
    expect(await countRows(pg, "projects", "owner_id = $1", [owner])).toBe(0);
  });

  it("fails for an unknown owner", async () => {
    await expectRaise(createProject("user_nobody", "P", 5), "P0002", "account_not_found");
  });

  it("still enforces the name CHECK", async () => {
    const owner = await newAccount();
    await expectPgError(createProject(owner, "", 5), PG.checkViolation);
  });

  describe("concurrency", () => {
    // pglite is a single Postgres backend: two transactions can't overlap, so a lock
    // can never make one wait for another here. These tests cover the two halves:
    // (1) two calls fired together at limit - 1 are queued, and exactly one succeeds;
    // (2) the function takes the lock that makes (1) hold on real Postgres. It locks the
    // owner's accounts row FOR UPDATE before counting, so a concurrent create for the same
    // owner waits for the first to commit, then counts with a fresh snapshot (READ
    // COMMITTED, VOLATILE function) and sees the new project.
    // pg_locks can't show (2): the project insert's FK check also takes a row-share lock
    // on that accounts row. So (2) checks the stored function body instead.
    it("two calls fired together at limit - 1: exactly one succeeds", async () => {
      const owner = await newAccount();
      await createProject(owner, "Existing", 1); // limit 2 → 1 slot left
      const results = await Promise.allSettled([
        createProject(owner, "Racer 1", 2),
        createProject(owner, "Racer 2", 2),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(rejected).toHaveLength(1);
      expect((rejected[0].reason as { message: string }).message).toBe("plan_limit");
      expect(await countRows(pg, "projects", "owner_id = $1", [owner])).toBe(2);
    });

    it("locks the owner's accounts row FOR UPDATE before counting, and is VOLATILE", async () => {
      const { rows } = await pg.db.query<{ src: string; volatility: string }>(
        `select prosrc as src, provolatile as volatility
         from pg_proc where oid = 'public.create_project(text, text, int)'::regprocedure`,
      );
      const src = rows[0].src.toLowerCase().replace(/\s+/g, " ");
      const lock = src.search(/from public\.accounts a where a\.clerk_user_id = p_owner_id for update;/);
      const count = src.indexOf("select count(*) into v_count from public.projects");
      expect(lock, "accounts row is locked FOR UPDATE").toBeGreaterThan(-1);
      expect(count, "the count runs after the lock").toBeGreaterThan(lock);
      expect(rows[0].volatility).toBe("v");
    });
  });

  describe("permissions", () => {
    it.each<ApiRole>(["anon", "authenticated"])("%s can't execute it", async (role) => {
      const owner = await newAccount();
      await expectPgError(
        pg.as(role, owner, (s) => s.query("select public.create_project($1, 'P', 5)", [owner])),
        PG.insufficientPrivilege,
      );
      expect(await countRows(pg, "projects", "owner_id = $1", [owner])).toBe(0);
    });

    it("only service_role holds EXECUTE (not PUBLIC)", async () => {
      const { rows } = await pg.db.query<{ role: string; can: boolean }>(
        `select r as role, has_function_privilege(r, 'public.create_project(text, text, int)', 'execute') as can
         from unnest(array['anon', 'authenticated', 'service_role']) as r`,
      );
      expect(rows).toEqual([
        { role: "anon", can: false },
        { role: "authenticated", can: false },
        { role: "service_role", can: true },
      ]);
      const { rows: acl } = await pg.db.query<{ acl: string }>(
        "select proacl::text as acl from pg_proc where oid = 'public.create_project(text, text, int)'::regprocedure",
      );
      expect(acl[0].acl).not.toMatch(/(^|[{,])=X/); // no PUBLIC grant
    });

    it("is SECURITY INVOKER with an empty search_path", async () => {
      const { rows } = await pg.db.query<{ secdef: boolean; config: string[] }>(
        "select prosecdef as secdef, proconfig as config from pg_proc where oid = 'public.create_project(text, text, int)'::regprocedure",
      );
      expect(rows[0].secdef).toBe(false);
      expect(rows[0].config).toEqual(['search_path=""']);
    });
  });
});
