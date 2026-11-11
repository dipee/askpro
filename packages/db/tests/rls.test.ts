import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabasePglite, type ApiRole, type SupabasePglite } from "../supabase-pglite";
import { EMBEDDING, PG, TABLES, countRows, expectPgError, seedOwner, type OwnerRows, type Table } from "./fixtures";

let pg: SupabasePglite;
let a: OwnerRows;
let b: OwnerRows;

beforeAll(async () => {
  pg = await createSupabasePglite();
  a = await seedOwner(pg, "user_a", "A's project");
  b = await seedOwner(pg, "user_b", "B's project");
});
afterAll(() => pg?.close());

/** Each table's row ID column and the seeded IDs it holds for an owner. */
const idOf: Record<Table, { column: string; id: (o: OwnerRows) => string }> = {
  accounts: { column: "clerk_user_id", id: (o) => o.sub },
  projects: { column: "id", id: (o) => o.projectId },
  widget_configs: { column: "project_id", id: (o) => o.projectId },
  knowledge_sources: { column: "id", id: (o) => o.sourceId },
  knowledge_chunks: { column: "id", id: (o) => o.chunkId },
  conversations: { column: "id", id: (o) => o.conversationId },
  messages: { column: "id", id: (o) => o.messageId },
};

/** A valid INSERT into each table for owner `o` (passes every constraint). */
const insertFor: Record<Table, (o: OwnerRows) => [string, unknown[]]> = {
  accounts: () => ["insert into public.accounts (clerk_user_id) values ('user_new')", []],
  projects: (o) => ["insert into public.projects (owner_id, name) values ($1, 'New')", [o.sub]],
  widget_configs: (o) => [
    // The project already has a config, but the privilege check fails before the PK check.
    "insert into public.widget_configs (project_id) values ($1)",
    [o.projectId],
  ],
  knowledge_sources: (o) => [
    "insert into public.knowledge_sources (project_id, title, type, status) values ($1, 'T', 'text', 'ready')",
    [o.projectId],
  ],
  knowledge_chunks: (o) => [
    `insert into public.knowledge_chunks (project_id, source_id, content, embedding)
     values ($1, $2, 'x', ${EMBEDDING})`,
    [o.projectId, o.sourceId],
  ],
  conversations: (o) => [
    "insert into public.conversations (project_id, visitor_id) values ($1, 'visitor_0002')",
    [o.projectId],
  ],
  messages: (o) => [
    "insert into public.messages (conversation_id, role, body) values ($1, 'bot', 'Hello')",
    [o.conversationId],
  ],
};

/** Every column of each table, from the catalog. */
async function columnsOf(table: Table): Promise<string[]> {
  const { rows } = await pg.db.query<{ column_name: string }>(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = $1 order by ordinal_position`,
    [table],
  );
  return rows.map((r) => r.column_name);
}

/** IDs `role`/`sub` can see in `table`. */
async function visibleIds(role: ApiRole, sub: string | null, table: Table) {
  const { column } = idOf[table];
  return pg.as(role, sub, async (s) => {
    const { rows } = await s.query<{ id: string }>(`select ${column}::text as id from public.${table}`);
    return rows.map((r) => r.id).sort();
  });
}

describe("authenticated: reads", () => {
  it.each(TABLES)("%s: each owner sees only their own rows", async (table) => {
    const { id } = idOf[table];
    expect(await visibleIds("authenticated", a.sub, table)).toEqual([id(a)]);
    expect(await visibleIds("authenticated", b.sub, table)).toEqual([id(b)]);
  });

  it.each(TABLES)("%s: a token without sub sees nothing", async (table) => {
    expect(await visibleIds("authenticated", null, table)).toEqual([]);
  });

  it.each(TABLES)("%s: an owner can't read another owner's row by ID", async (table) => {
    const { column, id } = idOf[table];
    const rows = await pg.as("authenticated", a.sub, async (s) =>
      (await s.query(`select 1 from public.${table} where ${column}::text = $1`, [id(b)])).rows,
    );
    expect(rows).toEqual([]);
  });

  it("the RLS helpers return only the caller's own IDs", async () => {
    const result = await pg.as("authenticated", a.sub, async (s) => ({
      projects: (await s.query<{ id: string }>("select private.owned_project_ids() as id")).rows,
      conversations: (await s.query<{ id: string }>("select private.owned_conversation_ids() as id")).rows,
    }));
    expect(result).toEqual({ projects: [{ id: a.projectId }], conversations: [{ id: a.conversationId }] });
  });
});

describe("authenticated: writes", () => {
  it.each(TABLES)("%s: INSERT is refused", async (table) => {
    const [sql, params] = insertFor[table](a);
    await expectPgError(pg.as("authenticated", a.sub, (s) => s.query(sql, params)), PG.insufficientPrivilege);
  });

  it.each(TABLES)("%s: TRUNCATE is refused", async (table) => {
    await expectPgError(
      pg.as("authenticated", a.sub, (s) => s.exec(`truncate public.${table} cascade`)),
      PG.insufficientPrivilege,
    );
  });

  it("an owner can rename their own project", async () => {
    const renamed = await pg.as("authenticated", a.sub, async (s) =>
      (await s.query<{ name: string }>("update public.projects set name = 'Renamed' where id = $1 returning name", [a.projectId])).rows,
    );
    expect(renamed).toEqual([{ name: "Renamed" }]);
  });

  it("an owner can't rename another owner's project", async () => {
    const result = await pg.as("authenticated", a.sub, (s) =>
      s.query("update public.projects set name = 'Hijacked' where id = $1", [b.projectId]),
    );
    expect(result.affectedRows).toBe(0);
    expect(await countRows(pg, "projects", "id = $1 and name = $2", [b.projectId, "B's project"])).toBe(1);
  });

  it("every projects column except name is read-only", async () => {
    const columns = (await columnsOf("projects")).filter((c) => c !== "name");
    expect(columns.length).toBeGreaterThan(0);
    for (const column of columns) {
      await expectPgError(
        pg.as("authenticated", a.sub, (s) =>
          s.query(`update public.projects set ${column} = ${column} where id = $1`, [a.projectId]),
        ),
        PG.insufficientPrivilege,
      );
    }
  });

  it.each(TABLES.filter((t) => t !== "projects"))("%s: every column is read-only", async (table) => {
    for (const column of await columnsOf(table)) {
      await expectPgError(
        pg.as("authenticated", a.sub, (s) => s.query(`update public.${table} set ${column} = ${column}`)),
        PG.insufficientPrivilege,
      );
    }
  });

  it.each(TABLES.filter((t) => t !== "projects"))("%s: DELETE is refused", async (table) => {
    await expectPgError(
      pg.as("authenticated", a.sub, (s) => s.query(`delete from public.${table}`)),
      PG.insufficientPrivilege,
    );
  });

  it("an owner can't delete another owner's project", async () => {
    const result = await pg.as("authenticated", a.sub, (s) =>
      s.query("delete from public.projects where id = $1", [b.projectId]),
    );
    expect(result.affectedRows).toBe(0);
    expect(await countRows(pg, "projects", "id = $1", [b.projectId])).toBe(1);
  });

  it("an owner can delete their own project, and its rows in every table go with it", async () => {
    const doomed = await seedOwner(pg, a.sub, "To delete");
    const children = () =>
      Promise.all([
        countRows(pg, "widget_configs", "project_id = $1", [doomed.projectId]),
        countRows(pg, "knowledge_sources", "project_id = $1", [doomed.projectId]),
        countRows(pg, "knowledge_chunks", "project_id = $1", [doomed.projectId]),
        countRows(pg, "conversations", "project_id = $1", [doomed.projectId]),
        countRows(pg, "messages", "conversation_id = $1", [doomed.conversationId]),
      ]);
    expect(await children()).toEqual([1, 1, 1, 1, 1]);

    const result = await pg.as("authenticated", a.sub, (s) =>
      s.query("delete from public.projects where id = $1", [doomed.projectId]),
    );

    expect(result.affectedRows).toBe(1);
    expect(await countRows(pg, "projects", "id = $1", [doomed.projectId])).toBe(0);
    expect(await children()).toEqual([0, 0, 0, 0, 0]);
    // Owner A's other project is untouched.
    expect(await countRows(pg, "projects", "id = $1", [a.projectId])).toBe(1);
  });
});

describe("anon", () => {
  it.each(TABLES)("%s: SELECT, INSERT, UPDATE, DELETE and TRUNCATE are refused", async (table) => {
    const [insertSql, insertParams] = insertFor[table](a);
    const statements: [string, unknown[]][] = [
      [`select * from public.${table}`, []],
      [insertSql, insertParams],
      [`update public.${table} set ${idOf[table].column} = ${idOf[table].column}`, []],
      [`delete from public.${table}`, []],
      [`truncate public.${table} cascade`, []],
    ];
    for (const [sql, params] of statements) {
      await expectPgError(pg.as("anon", a.sub, (s) => s.query(sql, params)), PG.insufficientPrivilege);
    }
  });

  it.each(["private.owned_project_ids()", "private.owned_conversation_ids()"])(
    "can't execute %s",
    async (fn) => {
      await expectPgError(pg.as("anon", a.sub, (s) => s.query(`select ${fn}`)), PG.insufficientPrivilege);
    },
  );

  it("has no table grant or function EXECUTE in our schemas", async () => {
    const { rows } = await pg.db.query(
      `select 'table' as kind, table_schema || '.' || table_name as name
       from information_schema.role_table_grants
       where grantee in ('anon', 'PUBLIC') and table_schema in ('public', 'private')
       union all
       select 'function', n.nspname || '.' || p.proname
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')`,
    );
    expect(rows).toEqual([]);
  });
});

describe("service_role", () => {
  it.each(TABLES)("%s: sees every owner's rows", async (table) => {
    const { id } = idOf[table];
    expect(await visibleIds("service_role", null, table)).toEqual([id(a), id(b)].sort());
  });

  it("can insert, update and delete in every table", async () => {
    await pg.as("service_role", null, async (s) => {
      await s.query("insert into public.accounts (clerk_user_id) values ('user_svc')");
      const project = (
        await s.query<{ id: string }>("insert into public.projects (owner_id, name) values ('user_svc', 'Svc') returning id")
      ).rows[0].id;
      await s.query("update public.projects set messages_used = messages_used + 1 where id = $1", [project]);
      await s.query("insert into public.widget_configs (project_id) values ($1)", [project]);
      await s.query("update public.widget_configs set show_badge = false where project_id = $1", [project]);
      const source = (
        await s.query<{ id: string }>(
          `insert into public.knowledge_sources (project_id, title, type, storage_key, status)
           values ($1, 'Doc', 'pdf', 'k/doc.pdf', 'uploading') returning id`,
          [project],
        )
      ).rows[0].id;
      await s.query("update public.knowledge_sources set status = 'ready' where id = $1", [source]);
      await s.query(
        `insert into public.knowledge_chunks (project_id, source_id, content, embedding)
         values ($1, $2, 'x', ${EMBEDDING})`,
        [project, source],
      );
      const conversation = (
        await s.query<{ id: string }>(
          "insert into public.conversations (project_id, visitor_id) values ($1, 'visitor_svc1') returning id",
          [project],
        )
      ).rows[0].id;
      await s.query("insert into public.messages (conversation_id, role, body) values ($1, 'visitor', 'Q')", [conversation]);
      await s.query("insert into public.messages (conversation_id, role, body) values ($1, 'bot', 'A')", [conversation]);

      // Messages saved in one transaction still sort visitor-then-bot.
      const order = await s.query<{ role: string }>(
        "select role from public.messages where conversation_id = $1 order by created_at",
        [conversation],
      );
      expect(order.rows.map((r) => r.role)).toEqual(["visitor", "bot"]);

      await s.query("delete from public.knowledge_sources where id = $1", [source]);
      await s.query("delete from public.projects where id = $1", [project]);
      await s.query("delete from public.accounts where clerk_user_id = 'user_svc'");
    });
    expect(await countRows(pg, "accounts", "clerk_user_id = 'user_svc'")).toBe(0);
  });

  it.each(TABLES)("%s: TRUNCATE is refused", async (table) => {
    await expectPgError(
      pg.as("service_role", null, (s) => s.exec(`truncate public.${table} cascade`)),
      PG.insufficientPrivilege,
    );
  });
});
