import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR, listMigrations } from "../supabase-pglite";

/**
 * Checks pglite can't make: pglite runs migrations as a superuser with pgvector already
 * loaded, while Supabase runs them as `postgres` (not a superuser) in a fresh session.
 */

/** A SET of a pgvector setting anywhere, e.g. a function's `set hnsw.iterative_scan = …`. */
const VECTOR_SETTING = /\bset\s+(local\s+|session\s+)?(hnsw|ivfflat)\.\w+/i;
/** A statement that makes this session load pgvector, e.g. `select '[1]'::extensions.vector;`. */
const VECTOR_LOAD = /^\s*select\s+'\[[^\]]*\]'::extensions\.vector\s*;/im;

/** SQL with block and `--` comments removed, so a commented-out load doesn't count. */
const stripComments = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, "");

/** Index of the first pgvector setting that comes before any pgvector load, or -1. */
function unloadedVectorSetting(sql: string): number {
  const code = stripComments(sql);
  const setting = code.search(VECTOR_SETTING);
  if (setting === -1) return -1;
  const load = code.search(VECTOR_LOAD);
  return load === -1 || load > setting ? setting : -1;
}

describe("unloadedVectorSetting", () => {
  it("flags a pgvector setting with no load before it", () => {
    expect(unloadedVectorSetting("create function f() returns int\nset hnsw.iterative_scan = 'relaxed_order'\nas $$ select 1 $$;")).toBeGreaterThan(-1);
    expect(unloadedVectorSetting("create function f()\n  set ivfflat.probes = 10\nas $$ $$;")).toBeGreaterThan(-1);
  });

  it("flags a setting on the same line as the declaration", () => {
    expect(unloadedVectorSetting("CREATE FUNCTION f() RETURNS integer SET hnsw.ef_search = 100\nAS $$ SELECT 1 $$ LANGUAGE sql;")).toBeGreaterThan(-1);
  });

  it("flags a load that is only inside a block comment", () => {
    const sql = "/*\nselect '[1]'::extensions.vector;\n*/\ncreate function f() returns integer\nset hnsw.ef_search = 100\nas $$ select 1 $$ language sql;";
    expect(unloadedVectorSetting(sql)).toBeGreaterThan(-1);
  });

  it("flags a load that only comes after, or only in a comment", () => {
    expect(unloadedVectorSetting("create function f()\nset hnsw.ef_search = 100\nas $$ $$;\nselect '[1]'::extensions.vector;")).toBeGreaterThan(-1);
    expect(unloadedVectorSetting("-- select '[1]'::extensions.vector;\ncreate function f()\nset hnsw.ef_search = 100\nas $$ $$;")).toBeGreaterThan(-1);
  });

  it("accepts a load before the setting, and files with no pgvector setting", () => {
    expect(unloadedVectorSetting("select '[1]'::extensions.vector;\ncreate function f()\nset hnsw.iterative_scan = 'relaxed_order'\nas $$ $$;")).toBe(-1);
    expect(unloadedVectorSetting("create function f() set search_path = '' as $$ $$;")).toBe(-1);
  });
});

describe("migrations", () => {
  it("load pgvector before any function SET of an hnsw.* / ivfflat.* setting", async () => {
    const offenders: string[] = [];
    for (const name of await listMigrations()) {
      const sql = await readFile(`${MIGRATIONS_DIR}${name}`, "utf8");
      if (unloadedVectorSetting(sql) !== -1) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });
});
