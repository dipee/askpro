/**
 * An in-memory Postgres (pglite) that looks enough like Supabase to test our
 * migrations, grants and RLS policies. Never a local Supabase stack (CLAUDE.md).
 *
 * It stubs what Supabase provides before our migrations run:
 * - the API roles `anon`, `authenticated`, `service_role` (`service_role` bypasses RLS)
 * - the `extensions` schema and `auth.jwt()`, which reads `request.jwt.claims`
 * - Supabase's default privileges: anon and authenticated get everything on new
 *   `public` tables and functions, so each migration must revoke what it doesn't grant
 *
 * Then it runs every file in `supabase/migrations` in name order.
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite, type Results, type Transaction } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

export type ApiRole = "anon" | "authenticated" | "service_role";

const SUPABASE_STUB = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;

  create schema auth;
  create schema extensions;
  grant usage on schema public, auth, extensions to anon, authenticated, service_role;

  -- Same body as Supabase's auth.jwt().
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
  $$;
  grant execute on function auth.jwt() to anon, authenticated, service_role;

  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

/** Runs SQL inside one transaction as an API role. */
export interface RoleSession {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<Results<T>>;
  exec(sql: string): Promise<unknown>;
}

export interface SupabasePglite {
  /** The superuser connection (`postgres`), like the SQL editor or a migration. */
  db: PGlite;
  /** Migration file names that were applied, in order. */
  migrations: string[];
  /**
   * Runs `fn` in a transaction as `role`, with JWT claims `{ role, sub }`.
   * The transaction rolls back if `fn` throws, so a refused statement leaves no trace.
   */
  as<T>(role: ApiRole, sub: string | null, fn: (session: RoleSession) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function listMigrations(dir = MIGRATIONS_DIR): Promise<string[]> {
  return (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
}

export async function createSupabasePglite(): Promise<SupabasePglite> {
  const db = await PGlite.create({ extensions: { vector } });
  await db.exec(SUPABASE_STUB);

  const migrations = await listMigrations();
  for (const name of migrations) {
    const sql = await readFile(`${MIGRATIONS_DIR}${name}`, "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${name} failed: ${(error as Error).message}`, { cause: error });
    }
  }

  return {
    db,
    migrations,
    as: (role, sub, fn) =>
      db.transaction(async (tx: Transaction) => {
        // `role` is a fixed union, never user input; SET ROLE can't take a parameter.
        await tx.exec(`set local role ${role}`);
        const claims = JSON.stringify(sub === null ? { role } : { role, sub });
        await tx.query("select set_config('request.jwt.claims', $1, true)", [claims]);
        return fn({
          query: (sql, params) => tx.query(sql, params),
          exec: (sql) => tx.exec(sql),
        });
      }),
    close: () => db.close(),
  };
}
