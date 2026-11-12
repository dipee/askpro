import { MAX_KNOWLEDGE_FILE_BYTES, PLAN_LIMITS, UPLOAD_CONTENT_TYPES } from "@askwell/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabasePglite, type ApiRole, type SupabasePglite } from "../supabase-pglite";
import { PG, countRows, expectPgError, expectRaise, functionSecurity, vec } from "./fixtures";

let pg: SupabasePglite;

beforeAll(async () => {
  pg = await createSupabasePglite();
});
afterAll(() => pg?.close());

let n = 0;
/** A fresh owner with one project and no sources. */
async function newProject() {
  const sub = `user_kf_${++n}`;
  await pg.db.query("insert into public.accounts (clerk_user_id) values ($1)", [sub]);
  const { rows } = await pg.db.query<{ id: string }>(
    "insert into public.projects (owner_id, name) values ($1, 'P') returning id",
    [sub],
  );
  return rows[0].id;
}

interface Reserved {
  id: string;
  project_id: string;
  title: string;
  type: string;
  storage_key: string | null;
  status: string;
  created_at: string;
  reclaimed_keys: string[];
}

const file = (projectId: string, key: string, limit: number) =>
  [projectId, `File ${key}`, "pdf", key, "uploading", limit] as const;
const text = (projectId: string, limit: number) =>
  [projectId, "Pasted", "text", null, "processing", limit] as const;

function reserve(args: readonly unknown[], role: ApiRole = "service_role") {
  return pg.as(role, null, async (s) => {
    const { rows } = await s.query<Reserved>(
      "select * from public.reserve_knowledge_source(p_project_id => $1, p_title => $2, p_type => $3, p_storage_key => $4, p_status => $5, p_limit => $6)",
      [...args],
    );
    expect(rows).toHaveLength(1);
    return rows[0];
  });
}

describe("knowledge bucket", () => {
  it("is private, with the shared size and type limits", async () => {
    const { rows } = await pg.db.query(
      "select id, public, file_size_limit::int as size, allowed_mime_types as types from storage.buckets",
    );
    expect(rows).toEqual([
      {
        id: "knowledge",
        public: false,
        size: MAX_KNOWLEDGE_FILE_BYTES,
        types: Object.values(UPLOAD_CONTENT_TYPES),
      },
    ]);
  });

  it("adds no storage.objects policies (only service_role reaches the files)", async () => {
    const { rows } = await pg.db.query(
      "select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'",
    );
    expect(rows).toEqual([]);
  });
});

describe("reserve_knowledge_source", () => {
  it("reserves a file as uploading and pasted text as processing", async () => {
    const projectId = await newProject();
    const f = await reserve(file(projectId, "k1", 3));
    expect(f).toMatchObject({ project_id: projectId, type: "pdf", storage_key: "k1", status: "uploading", reclaimed_keys: [] });
    const t = await reserve(text(projectId, 3));
    expect(t).toMatchObject({ type: "text", storage_key: null, status: "processing", reclaimed_keys: [] });
    expect(await countRows(pg, "knowledge_sources", "project_id = $1", [projectId])).toBe(2);
  });

  it("lets pasted text omit p_storage_key (it defaults to null)", async () => {
    const projectId = await newProject();
    const { rows } = await pg.as("service_role", null, (s) =>
      s.query<Reserved>(
        "select * from public.reserve_knowledge_source(p_project_id => $1, p_title => 'Pasted', p_type => 'text', p_status => 'processing', p_limit => 3)",
        [projectId],
      ),
    );
    expect(rows).toEqual([expect.objectContaining({ type: "text", storage_key: null, status: "processing" })]);
  });

  it("allows sources up to the limit it is given, then refuses with plan_limit", async () => {
    const projectId = await newProject();
    const limit = PLAN_LIMITS.free.knowledgeSources;
    for (let i = 0; i < limit; i++) await reserve(i % 2 ? text(projectId, limit) : file(projectId, `l${i}`, limit));
    await expectRaise(reserve(file(projectId, "over", limit)), "P0001", "plan_limit");
    await expectRaise(reserve(text(projectId, limit)), "P0001", "plan_limit");
    expect(await countRows(pg, "knowledge_sources", "project_id = $1", [projectId])).toBe(limit);
  });

  it("counts only this project's sources", async () => {
    const a = await newProject();
    const b = await newProject();
    await reserve(file(a, "a1", 1));
    await expect(reserve(file(b, "b1", 1))).resolves.toMatchObject({ project_id: b });
  });

  it("reclaims this project's uploads older than 2 hours and returns their keys", async () => {
    const projectId = await newProject();
    const other = await newProject();
    const insert = (pid: string, key: string, status: string, age: string) =>
      pg.db.query(
        `insert into public.knowledge_sources (project_id, title, type, storage_key, status, created_at)
         values ($1, 'Old', 'pdf', $2, $3, now() - $4::interval)`,
        [pid, key, status, age],
      );
    await insert(projectId, "stale", "uploading", "3 hours");
    await insert(projectId, "fresh", "uploading", "1 hour");
    await insert(projectId, "done", "ready", "3 hours");
    await insert(other, "other-stale", "uploading", "3 hours");

    // At limit 3 the project is full, but the stale upload frees a slot.
    const r = await reserve(file(projectId, "new", 3));
    expect(r.reclaimed_keys).toEqual(["stale"]);

    const { rows } = await pg.db.query<{ storage_key: string }>(
      "select storage_key from public.knowledge_sources where project_id = $1 order by storage_key",
      [projectId],
    );
    expect(rows.map((x) => x.storage_key)).toEqual(["done", "fresh", "new"]);
    expect(await countRows(pg, "knowledge_sources", "storage_key = 'other-stale'")).toBe(1);
  });

  it("refuses a mismatched type, status and storage_key", async () => {
    const projectId = await newProject();
    for (const args of [
      [projectId, "T", "text", "key", "processing", 3], // text with a key
      [projectId, "T", "text", null, "uploading", 3], // text as uploading
      [projectId, "F", "pdf", null, "uploading", 3], // file without a key
      [projectId, "F", "pdf", "key", "processing", 3], // file not uploading
      [projectId, "F", "pdf", "key", "ready", 3],
      [projectId, "F", "doc", "key", "uploading", 3],
    ]) {
      await expectRaise(reserve(args), "22023", "invalid_source");
    }
    expect(await countRows(pg, "knowledge_sources", "project_id = $1", [projectId])).toBe(0);
  });

  it("refuses a null or negative limit, and an unknown project", async () => {
    const projectId = await newProject();
    await expectRaise(reserve(file(projectId, "k", -1)), "22023", "invalid_limit");
    await expectRaise(reserve([projectId, "F", "pdf", "k", "uploading", null]), "22023", "invalid_limit");
    await expectRaise(reserve(file("00000000-0000-4000-8000-000000000000", "k", 3)), "P0002", "project_not_found");
  });

  it("still enforces the title CHECK", async () => {
    const projectId = await newProject();
    await expectPgError(reserve([projectId, "", "text", null, "processing", 3]), PG.checkViolation);
  });

  describe("concurrency", () => {
    // pglite is one backend, so transactions never overlap (see create-project.test.ts).
    // (1) two calls fired together at limit - 1: exactly one succeeds;
    // (2) the stored body locks the project row FOR UPDATE before it reclaims and counts.
    it("two reservations fired together at limit - 1: exactly one succeeds", async () => {
      const projectId = await newProject();
      await reserve(file(projectId, "existing", 2));
      const results = await Promise.allSettled([
        reserve(file(projectId, "racer1", 2)),
        reserve(text(projectId, 2)),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect((rejected[0].reason as { message: string }).message).toBe("plan_limit");
      expect(await countRows(pg, "knowledge_sources", "project_id = $1", [projectId])).toBe(2);
    });

    it("locks the project row FOR UPDATE before reclaiming and counting, and is VOLATILE", async () => {
      const { rows } = await pg.db.query<{ src: string; volatility: string }>(
        `select prosrc as src, provolatile as volatility from pg_proc
         where oid = 'public.reserve_knowledge_source(uuid, text, text, text, int, text)'::regprocedure`,
      );
      const src = rows[0].src.toLowerCase().replace(/\s+/g, " ");
      const lock = src.indexOf("from public.projects p where p.id = p_project_id for update;");
      const reclaim = src.indexOf("delete from public.knowledge_sources");
      const count = src.indexOf("select count(*) into v_count");
      expect(lock, "project row is locked FOR UPDATE").toBeGreaterThan(-1);
      expect(reclaim, "the reclaim runs after the lock").toBeGreaterThan(lock);
      expect(count, "the count runs after the reclaim").toBeGreaterThan(reclaim);
      expect(rows[0].volatility).toBe("v");
    });
  });
});

describe("match_chunks", () => {
  interface Match {
    id: string;
    source_id: string;
    content: string;
    similarity: number;
  }

  async function addSource(projectId: string, status: string) {
    const { rows } = await pg.db.query<{ id: string }>(
      `insert into public.knowledge_sources (project_id, title, type, status)
       values ($1, 'S', 'text', $2) returning id`,
      [projectId, status],
    );
    return rows[0].id;
  }
  async function addChunk(projectId: string, sourceId: string, content: string, embedding: string) {
    await pg.db.query(
      `insert into public.knowledge_chunks (project_id, source_id, content, embedding)
       values ($1, $2, $3, $4::extensions.vector)`,
      [projectId, sourceId, content, embedding],
    );
  }
  function match(projectId: string, embedding: string, count?: number, before = "") {
    return pg.as("service_role", null, async (s) => {
      if (before) await s.exec(before);
      const args = count === undefined ? "$1, $2::extensions.vector" : "$1, $2::extensions.vector, $3";
      const params = count === undefined ? [projectId, embedding] : [projectId, embedding, count];
      return (await s.query<Match>(`select * from public.match_chunks(${args})`, params)).rows;
    });
  }

  it("returns this project's ready chunks only, nearest first, with cosine similarity", async () => {
    const mine = await newProject();
    const other = await newProject();
    const ready = await addSource(mine, "ready");
    await addChunk(mine, ready, "exact", vec(1));
    await addChunk(mine, ready, "close", vec(1, 1));
    await addChunk(mine, ready, "far", vec(0, 1));
    for (const status of ["uploading", "processing", "failed"]) {
      await addChunk(mine, await addSource(mine, status), `not ready: ${status}`, vec(1));
    }
    await addChunk(other, await addSource(other, "ready"), "other project", vec(1));

    const rows = await match(mine, vec(1));
    expect(rows.map((r) => r.content)).toEqual(["exact", "close", "far"]);
    expect(rows[0].similarity).toBeCloseTo(1);
    expect(rows[1].similarity).toBeCloseTo(Math.SQRT1_2);
    expect(rows[2].similarity).toBeCloseTo(0);
    expect(rows.every((r) => r.source_id === ready)).toBe(true);
  });

  it("defaults to 5 rows and honours p_count", async () => {
    const mine = await newProject();
    const src = await addSource(mine, "ready");
    for (let i = 1; i <= 7; i++) await addChunk(mine, src, `c${i}`, vec(1, i / 10));
    expect(await match(mine, vec(1))).toHaveLength(5);
    expect((await match(mine, vec(1), 2)).map((r) => r.content)).toEqual(["c1", "c2"]);
  });

  it("refuses a p_count outside 1..50", async () => {
    const mine = await newProject();
    for (const count of [0, 51, null]) {
      await expectRaise(match(mine, vec(1), count as number), "22023", "invalid_count");
    }
  });

  it("still finds a small project's chunks through the HNSW index when other projects crowd it", async () => {
    // 60 closer chunks in another project fill the index's default ef_search (40).
    // Without hnsw.iterative_scan the filtered result would be empty.
    const mine = await newProject();
    const crowd = await newProject();
    const crowdSrc = await addSource(crowd, "ready");
    for (let i = 0; i < 60; i++) await addChunk(crowd, crowdSrc, `crowd ${i}`, vec(1, i / 1000));
    await addChunk(mine, await addSource(mine, "ready"), "mine", vec(1, 5));

    const forceIndex = "set local enable_seqscan = off; set local enable_sort = off;";
    const { rows: plan } = await pg.as("service_role", null, async (s) => {
      await s.exec(forceIndex);
      return s.query<{ "QUERY PLAN": string }>(
        `explain select c.id from public.knowledge_chunks c
         where c.project_id = $1 order by c.embedding operator(extensions.<=>) $2::extensions.vector limit 5`,
        [mine, vec(1)],
      );
    });
    expect(plan.map((r) => r["QUERY PLAN"]).join("\n")).toContain("knowledge_chunks_embedding_idx");

    expect((await match(mine, vec(1), 5, forceIndex)).map((r) => r.content)).toEqual(["mine"]);
  });
});

describe("permissions", () => {
  const signatures = [
    "public.reserve_knowledge_source(uuid, text, text, text, int, text)",
    "public.match_chunks(uuid, extensions.vector, int)",
  ];

  it.each<ApiRole>(["anon", "authenticated"])("%s can't execute either function", async (role) => {
    const projectId = await newProject();
    await expectPgError(
      pg.as(role, "user_x", (s) =>
        s.query("select * from public.reserve_knowledge_source($1, 'T', 'text', 'processing', 3)", [projectId]),
      ),
      PG.insufficientPrivilege,
    );
    await expectPgError(
      pg.as(role, "user_x", (s) =>
        s.query("select * from public.match_chunks($1, $2::extensions.vector)", [projectId, vec(1)]),
      ),
      PG.insufficientPrivilege,
    );
    expect(await countRows(pg, "knowledge_sources", "project_id = $1", [projectId])).toBe(0);
  });

  it.each(signatures)("%s: only service_role holds EXECUTE, SECURITY INVOKER, empty search_path", async (sig) => {
    const sec = await functionSecurity(pg, sig);
    expect(sec.can).toEqual([
      { role: "anon", can: false },
      { role: "authenticated", can: false },
      { role: "service_role", can: true },
    ]);
    expect(sec.acl).not.toMatch(/(^|[{,])=X/); // no PUBLIC grant
    expect(sec.secdef).toBe(false);
    expect(sec.config).toContain('search_path=""');
  });
});
