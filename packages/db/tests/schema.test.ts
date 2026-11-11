import {
  DEFAULT_WIDGET_CONFIG,
  KNOWLEDGE_SOURCE_STATUSES,
  KNOWLEDGE_SOURCE_TYPES,
  MESSAGE_ROLES,
  PLANS,
  WIDGET_ANIMATIONS,
  WIDGET_POSITIONS,
} from "@askwell/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabasePglite, type SupabasePglite } from "../supabase-pglite";
import { EMBEDDING, PG, TABLES, expectPgError, seedOwner, type OwnerRows } from "./fixtures";

let pg: SupabasePglite;
let owner: OwnerRows;

beforeAll(async () => {
  pg = await createSupabasePglite();
  owner = await seedOwner(pg, "user_schema");
});
afterAll(() => pg?.close());

/** Runs `sql` as the superuser and rolls it back, so each check starts clean. */
async function tryAsSuperuser(sql: string, params: unknown[] = []) {
  await pg.db.transaction(async (tx) => {
    await tx.query(sql, params);
    await tx.rollback();
  });
}

describe("migration", () => {
  it("is one init_schema file that applies cleanly", () => {
    expect(pg.migrations).toHaveLength(1);
    expect(pg.migrations[0]).toMatch(/^\d{14}_init_schema\.sql$/);
  });

  it("creates the 7 tables of project.md §7 with exactly their columns", async () => {
    const { rows } = await pg.db.query<{ table_name: string; columns: string[] }>(
      `select table_name, array_agg(column_name::text order by ordinal_position) as columns
       from information_schema.columns where table_schema = 'public'
       group by table_name`,
    );
    const columns = Object.fromEntries(rows.map((r) => [r.table_name, r.columns]));
    expect(columns).toEqual({
      accounts: ["clerk_user_id", "plan", "created_at"],
      projects: ["id", "owner_id", "name", "public_key", "messages_used", "period_start", "created_at"],
      widget_configs: ["project_id", "button_color", "position", "label", "animation", "header_text", "show_badge"],
      knowledge_sources: ["id", "project_id", "title", "type", "storage_key", "status", "created_at"],
      knowledge_chunks: ["id", "project_id", "source_id", "content", "embedding"],
      conversations: ["id", "project_id", "visitor_id", "created_at"],
      messages: ["id", "conversation_id", "role", "body", "created_at"],
    });
  });

  it("turns RLS on for every table", async () => {
    const { rows } = await pg.db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`,
    );
    expect(rows.map((r) => r.relname).sort()).toEqual([...TABLES].sort());
    for (const row of rows) expect(row.relrowsecurity, row.relname).toBe(true);
  });

  it("installs vector in the extensions schema with a 1536-dim embedding column", async () => {
    const { rows } = await pg.db.query<{ schema: string; type: string }>(
      `select e.extnamespace::regnamespace::text as schema,
              format_type(a.atttypid, a.atttypmod) as type
       from pg_extension e, pg_attribute a
       where e.extname = 'vector'
         and a.attrelid = 'public.knowledge_chunks'::regclass and a.attname = 'embedding'`,
    );
    expect(rows).toEqual([{ schema: "extensions", type: "extensions.vector(1536)" }]);
  });

  it("has an HNSW cosine index on knowledge_chunks.embedding", async () => {
    const { rows } = await pg.db.query<{ indexdef: string }>(
      `select indexdef from pg_indexes where tablename = 'knowledge_chunks' and indexdef ilike '%hnsw%'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/using hnsw \(embedding extensions\.vector_cosine_ops\)/i);
  });

  it("indexes every foreign key and projects.owner_id", async () => {
    // Each FK's columns must be the leading columns of some index on that table.
    const { rows } = await pg.db.query<{ fk: string }>(
      `select c.conname as fk
       from pg_constraint c
       where c.contype = 'f' and c.connamespace = 'public'::regnamespace
         and not exists (
           select 1 from pg_index i
           where i.indrelid = c.conrelid
             and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] = c.conkey
         )`,
    );
    expect(rows).toEqual([]);
    const { rows: ownerIdx } = await pg.db.query(
      `select 1 from pg_indexes where tablename = 'projects' and indexdef like '%(owner_id)%'`,
    );
    expect(ownerIdx).toHaveLength(1);
  });

  it("makes public_key unique", async () => {
    const { rows } = await pg.db.query<{ public_key: string }>(
      "select public_key from public.projects where id = $1",
      [owner.projectId],
    );
    await expectPgError(
      tryAsSuperuser("insert into public.projects (owner_id, name, public_key) values ($1, 'Dup', $2)", [
        owner.sub,
        rows[0].public_key,
      ]),
      "23505",
    );
  });
});

describe("defaults", () => {
  it("gives a new project a pk_ key, 0 messages used and a period starting this month (UTC)", async () => {
    const { rows } = await pg.db.query<{ public_key: string; messages_used: number; ok: boolean }>(
      `select public_key, messages_used,
              period_start = date_trunc('month', now() at time zone 'utc') at time zone 'utc' as ok
       from public.projects where id = $1`,
      [owner.projectId],
    );
    expect(rows[0].public_key).toMatch(/^pk_[A-Za-z0-9_-]{1,64}$/);
    expect(rows[0].messages_used).toBe(0);
    expect(rows[0].ok).toBe(true);
  });

  it("gives a new account the free plan", async () => {
    const { rows } = await pg.db.query("select plan from public.accounts where clerk_user_id = $1", [owner.sub]);
    expect(rows).toEqual([{ plan: "free" }]);
  });

  it("gives a new widget config DEFAULT_WIDGET_CONFIG", async () => {
    const { rows } = await pg.db.query(
      `select button_color as "buttonColor", position, label, animation,
              header_text as "headerText", show_badge as "showBadge"
       from public.widget_configs where project_id = $1`,
      [owner.projectId],
    );
    expect(rows).toEqual([DEFAULT_WIDGET_CONFIG]);
  });
});

describe("CHECK constraints match packages/shared", () => {
  const cases = [
    {
      name: "accounts.plan",
      valid: PLANS,
      sql: "insert into public.accounts (clerk_user_id, plan) values ('user_check', $1)",
    },
    {
      name: "widget_configs.position",
      valid: WIDGET_POSITIONS,
      sql: "update public.widget_configs set position = $1 where project_id = $2",
    },
    {
      name: "widget_configs.animation",
      valid: WIDGET_ANIMATIONS,
      sql: "update public.widget_configs set animation = $1 where project_id = $2",
    },
    {
      name: "knowledge_sources.type",
      valid: KNOWLEDGE_SOURCE_TYPES,
      sql: "insert into public.knowledge_sources (project_id, title, type, status) values ($2, 'T', $1, 'ready')",
    },
    {
      name: "knowledge_sources.status",
      valid: KNOWLEDGE_SOURCE_STATUSES,
      sql: "insert into public.knowledge_sources (project_id, title, type, status) values ($2, 'T', 'text', $1)",
    },
    {
      name: "messages.role",
      valid: MESSAGE_ROLES,
      sql: "insert into public.messages (conversation_id, role, body) values ($2, $1, 'x')",
    },
  ] as const;

  /** messages.role takes a conversation ID; everything else a project ID. */
  const target = (name: string) => (name === "messages.role" ? owner.conversationId : owner.projectId);
  const params = (name: string, value: string) =>
    name === "accounts.plan" ? [value] : [value, target(name)];

  for (const { name, valid, sql } of cases) {
    it(`${name} accepts every shared value and rejects others`, async () => {
      for (const value of valid) await tryAsSuperuser(sql, params(name, value));
      for (const bad of ["", "other", valid[0].toUpperCase()]) {
        await expectPgError(tryAsSuperuser(sql, params(name, bad)), PG.checkViolation);
      }
    });
  }

  it.each([
    ["a bad button color", "update public.widget_configs set button_color = 'blue' where project_id = $1"],
    ["a too-long label", "update public.widget_configs set label = repeat('x', 31) where project_id = $1"],
    ["an empty header", "update public.widget_configs set header_text = '' where project_id = $1"],
    ["an empty project name", "update public.projects set name = '' where id = $1"],
    ["a too-long project name", "update public.projects set name = repeat('x', 61) where id = $1"],
    ["a malformed public key", "update public.projects set public_key = 'key_1' where id = $1"],
    ["negative messages used", "update public.projects set messages_used = -1 where id = $1"],
    [
      "a storage key on pasted text",
      "insert into public.knowledge_sources (project_id, title, type, storage_key, status) values ($1, 'T', 'text', 'k', 'ready')",
    ],
    [
      "a bad visitor ID",
      "insert into public.conversations (project_id, visitor_id) values ($1, 'short')",
    ],
  ])("rejects %s", async (_, sql) => {
    await expectPgError(tryAsSuperuser(sql, [owner.projectId]), PG.checkViolation);
  });

  it("rejects a chunk whose source is in another project", async () => {
    const other = await seedOwner(pg, "user_schema_other");
    await expectPgError(
      tryAsSuperuser(
        `insert into public.knowledge_chunks (project_id, source_id, content, embedding)
         values ($1, $2, 'x', ${EMBEDDING})`,
        [owner.projectId, other.sourceId],
      ),
      "23503",
    );
  });
});
