import { PLAN_LIMITS } from "@askwell/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabasePglite, type ApiRole, type SupabasePglite } from "../supabase-pglite";
import { PG, countRows, expectPgError, expectRaise, functionSecurity } from "./fixtures";

let pg: SupabasePglite;

beforeAll(async () => {
  pg = await createSupabasePglite();
});
afterAll(() => pg?.close());

const UNKNOWN = "00000000-0000-4000-8000-000000000000";

let n = 0;
async function newProject() {
  const sub = `user_cf_${++n}`;
  await pg.db.query("insert into public.accounts (clerk_user_id) values ($1)", [sub]);
  const { rows } = await pg.db.query<{ id: string }>(
    "insert into public.projects (owner_id, name) values ($1, 'P') returning id",
    [sub],
  );
  return rows[0].id;
}

async function usage(projectId: string) {
  const { rows } = await pg.db.query<{ used: number; current: boolean }>(
    `select messages_used as used,
            period_start = date_trunc('month', now() at time zone 'utc') at time zone 'utc' as current
     from public.projects where id = $1`,
    [projectId],
  );
  return rows[0];
}

describe("consume_message", () => {
  interface Consumed {
    accepted: boolean;
    messages_used: number;
    message_limit: number;
  }
  function consume(projectId: string, limit: number | null, role: ApiRole = "service_role") {
    return pg.as(role, null, async (s) => {
      const { rows } = await s.query<Consumed>("select * from public.consume_message($1, $2)", [projectId, limit]);
      expect(rows).toHaveLength(1);
      return rows[0];
    });
  }

  it("counts messages up to the limit, then refuses without counting", async () => {
    const projectId = await newProject();
    expect(await consume(projectId, 2)).toEqual({ accepted: true, messages_used: 1, message_limit: 2 });
    expect(await consume(projectId, 2)).toEqual({ accepted: true, messages_used: 2, message_limit: 2 });
    expect(await consume(projectId, 2)).toEqual({ accepted: false, messages_used: 2, message_limit: 2 });
    expect((await usage(projectId)).used).toBe(2);
  });

  it("uses the limit it is given (a plan change applies at once)", async () => {
    const projectId = await newProject();
    await pg.db.query("update public.projects set messages_used = $2 where id = $1", [
      projectId,
      PLAN_LIMITS.free.messagesPerMonth,
    ]);
    expect((await consume(projectId, PLAN_LIMITS.free.messagesPerMonth)).accepted).toBe(false);
    expect(await consume(projectId, PLAN_LIMITS.pro.messagesPerMonth)).toMatchObject({
      accepted: true,
      messages_used: PLAN_LIMITS.free.messagesPerMonth + 1,
    });
  });

  it("starts a new count in a new UTC month, even when last month hit the limit", async () => {
    const projectId = await newProject();
    await pg.db.query(
      `update public.projects
       set messages_used = 5,
           period_start = (date_trunc('month', now() at time zone 'utc') - interval '1 month') at time zone 'utc'
       where id = $1`,
      [projectId],
    );
    expect(await consume(projectId, 5)).toEqual({ accepted: true, messages_used: 1, message_limit: 5 });
    expect(await usage(projectId)).toEqual({ used: 1, current: true });
    expect(await consume(projectId, 5)).toMatchObject({ messages_used: 2 });
  });

  it("refuses a null or negative limit, and an unknown project", async () => {
    const projectId = await newProject();
    await expectRaise(consume(projectId, -1), "22023", "invalid_limit");
    await expectRaise(consume(projectId, null), "22023", "invalid_limit");
    await expectRaise(consume(UNKNOWN, 5), "P0002", "project_not_found");
    expect((await usage(projectId)).used).toBe(0);
  });

  describe("concurrency", () => {
    // One UPDATE checks and writes; on real Postgres a concurrent UPDATE of the same row
    // waits and re-checks its WHERE against the committed row. pglite can't overlap
    // transactions, so this checks the queued outcome and the statement shape.
    it("two messages fired together at limit - 1: exactly one is accepted", async () => {
      const projectId = await newProject();
      await consume(projectId, 2);
      const results = await Promise.all([consume(projectId, 2), consume(projectId, 2)]);
      expect(results.map((r) => r.accepted).sort()).toEqual([false, true]);
      expect((await usage(projectId)).used).toBe(2);
    });

    it("checks the limit in the same UPDATE that increments", async () => {
      const { rows } = await pg.db.query<{ src: string }>(
        "select prosrc as src from pg_proc where oid = 'public.consume_message(uuid, int)'::regprocedure",
      );
      const src = rows[0].src.toLowerCase().replace(/\s+/g, " ");
      expect(src).toMatch(
        /update public\.projects p set messages_used = .*\+ 1,.* where p\.id = p_project_id and .*< p_limit returning/,
      );
    });
  });
});

describe("save_chat_turn", () => {
  function save(
    projectId: string,
    conversationId: string | null,
    visitor = "Hi",
    bot = "Hello!",
    visitorId = "visitor_0001",
  ) {
    return pg.as("service_role", null, async (s) => {
      const { rows } = await s.query<{ id: string }>(
        "select public.save_chat_turn(p_project_id => $1, p_visitor_id => $5, p_conversation_id => $2, p_visitor_body => $3, p_bot_body => $4) as id",
        [projectId, conversationId, visitor, bot, visitorId],
      );
      return rows[0].id;
    });
  }
  async function messages(conversationId: string) {
    const { rows } = await pg.db.query<{ role: string; body: string }>(
      "select role, body from public.messages where conversation_id = $1 order by created_at",
      [conversationId],
    );
    return rows;
  }

  it("creates the conversation on the first turn, then appends to it", async () => {
    const projectId = await newProject();
    const id = await save(projectId, null, "Do you ship?", "Yes, worldwide.");
    const { rows } = await pg.db.query("select project_id, visitor_id from public.conversations where id = $1", [id]);
    expect(rows).toEqual([{ project_id: projectId, visitor_id: "visitor_0001" }]);

    expect(await save(projectId, id, "How long?", "I don't know.")).toBe(id);
    expect(await messages(id)).toEqual([
      { role: "visitor", body: "Do you ship?" },
      { role: "bot", body: "Yes, worldwide." },
      { role: "visitor", body: "How long?" },
      { role: "bot", body: "I don't know." },
    ]);
    expect(await countRows(pg, "conversations", "project_id = $1", [projectId])).toBe(1);
  });

  it("creates a conversation when p_conversation_id is omitted (it defaults to null)", async () => {
    const projectId = await newProject();
    const { rows } = await pg.as("service_role", null, (s) =>
      s.query<{ id: string }>(
        "select public.save_chat_turn(p_project_id => $1, p_visitor_id => 'visitor_0002', p_visitor_body => 'Hi', p_bot_body => 'Hello!') as id",
        [projectId],
      ),
    );
    expect(await messages(rows[0].id)).toEqual([
      { role: "visitor", body: "Hi" },
      { role: "bot", body: "Hello!" },
    ]);
  });

  it("refuses another project's conversation and saves nothing", async () => {
    const mine = await newProject();
    const other = await newProject();
    const theirs = await save(other, null);
    await expectRaise(save(mine, theirs), "P0002", "conversation_not_found");
    await expectRaise(save(mine, UNKNOWN), "P0002", "conversation_not_found");
    expect(await messages(theirs)).toHaveLength(2);
    expect(await countRows(pg, "conversations", "project_id = $1", [mine])).toBe(0);
  });

  it("refuses another visitor's conversation in the same project and saves nothing", async () => {
    const projectId = await newProject();
    const theirs = await save(projectId, null, "Hi", "Hello!", "visitor_other");
    await expectRaise(save(projectId, theirs), "P0002", "conversation_not_found");
    expect(await messages(theirs)).toHaveLength(2);
    expect(await countRows(pg, "conversations", "project_id = $1", [projectId])).toBe(1);
    // Its own visitor can still continue it.
    expect(await save(projectId, theirs, "More?", "Yes.", "visitor_other")).toBe(theirs);
    expect(await messages(theirs)).toHaveLength(4);
  });

  it("checks the visitor in the stored function body", async () => {
    const { rows } = await pg.db.query<{ src: string }>(
      "select prosrc as src from pg_proc where oid = 'public.save_chat_turn(uuid, text, text, text, uuid)'::regprocedure",
    );
    expect(rows[0].src).toMatch(/c\.visitor_id\s*=\s*p_visitor_id/);
  });

  it("refuses an unknown project", async () => {
    await expectRaise(save(UNKNOWN, null), "P0002", "project_not_found");
  });

  it("saves neither message when one breaks a CHECK", async () => {
    const projectId = await newProject();
    const id = await save(projectId, null);
    await expectPgError(save(projectId, id, "Hi again", ""), PG.checkViolation);
    expect(await messages(id)).toHaveLength(2);
  });
});

describe("permissions", () => {
  const signatures = ["public.consume_message(uuid, int)", "public.save_chat_turn(uuid, text, text, text, uuid)"];

  it.each<ApiRole>(["anon", "authenticated"])("%s can't execute either function", async (role) => {
    const projectId = await newProject();
    await expectPgError(
      pg.as(role, "user_x", (s) => s.query("select * from public.consume_message($1, 5)", [projectId])),
      PG.insufficientPrivilege,
    );
    await expectPgError(
      pg.as(role, "user_x", (s) =>
        s.query("select public.save_chat_turn($1, 'visitor_0001', 'Hi', 'Hello')", [projectId]),
      ),
      PG.insufficientPrivilege,
    );
    expect((await usage(projectId)).used).toBe(0);
    expect(await countRows(pg, "conversations", "project_id = $1", [projectId])).toBe(0);
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
    expect(sec.config).toEqual(['search_path=""']);
  });
});
