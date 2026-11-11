import { expect } from "vitest";
import type { SupabasePglite } from "../supabase-pglite";

export const TABLES = [
  "accounts",
  "projects",
  "widget_configs",
  "knowledge_sources",
  "knowledge_chunks",
  "conversations",
  "messages",
] as const;
export type Table = (typeof TABLES)[number];

/** Postgres error codes the tests expect. */
export const PG = {
  insufficientPrivilege: "42501",
  checkViolation: "23514",
} as const;

/** A 1536-dim embedding literal. */
export const EMBEDDING = `array_fill(0.01::real, array[1536])::extensions.vector`;

export interface OwnerRows {
  sub: string;
  projectId: string;
  sourceId: string;
  chunkId: string;
  conversationId: string;
  messageId: string;
}

/** One owner with one row in every table. Inserted as the superuser. */
export async function seedOwner(
  { db }: SupabasePglite,
  sub: string,
  projectName = "Project",
): Promise<OwnerRows> {
  await db.query("insert into public.accounts (clerk_user_id) values ($1) on conflict do nothing", [sub]);
  const one = async (sql: string, params: unknown[]) =>
    (await db.query<{ id: string }>(sql, params)).rows[0].id;

  const projectId = await one(
    "insert into public.projects (owner_id, name) values ($1, $2) returning id",
    [sub, projectName],
  );
  await db.query("insert into public.widget_configs (project_id) values ($1)", [projectId]);
  const sourceId = await one(
    `insert into public.knowledge_sources (project_id, title, type, status)
     values ($1, 'FAQ', 'text', 'ready') returning id`,
    [projectId],
  );
  const chunkId = await one(
    `insert into public.knowledge_chunks (project_id, source_id, content, embedding)
     values ($1, $2, 'We ship worldwide.', ${EMBEDDING}) returning id`,
    [projectId, sourceId],
  );
  const conversationId = await one(
    "insert into public.conversations (project_id, visitor_id) values ($1, 'visitor_0001') returning id",
    [projectId],
  );
  const messageId = await one(
    "insert into public.messages (conversation_id, role, body) values ($1, 'visitor', 'Hi') returning id",
    [conversationId],
  );
  return { sub, projectId, sourceId, chunkId, conversationId, messageId };
}

/** Counts a table's rows as the superuser (RLS doesn't apply). */
export async function countRows(pg: SupabasePglite, table: Table, where = "true", params: unknown[] = []) {
  const { rows } = await pg.db.query<{ n: number }>(
    `select count(*)::int as n from public.${table} where ${where}`,
    params,
  );
  return rows[0].n;
}

/** Expects `promise` to fail with Postgres error `code`. */
export async function expectPgError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `expected Postgres error ${code}, but the statement succeeded`).not.toBeNull();
  expect((error as { code?: string }).code).toBe(code);
}
