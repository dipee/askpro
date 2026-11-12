import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const embedTexts = vi.hoisted(() => vi.fn<(texts: string[]) => Promise<number[][]>>());
vi.mock("../ai/openai", () => ({ embedTexts }));

type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] };
type Reply = { data?: unknown; error?: unknown };

/** A fake service client that records each query and answers from `reply`. */
const fake = vi.hoisted(() => {
  const state: { calls: Call[]; reply: (call: Call) => Reply } = {
    calls: [],
    reply: () => ({ data: [{ id: "s1" }], error: null }),
  };
  const query = (table: string, op: string, payload?: unknown) => {
    const call: Call = { table, op, payload, filters: [] };
    state.calls.push(call);
    const q = {
      eq(col: string, val: unknown) {
        call.filters.push([col, val]);
        return q;
      },
      select() {
        return q;
      },
      then<T>(resolve: (r: Reply) => T, reject?: (e: unknown) => T) {
        return Promise.resolve(state.reply(call)).then(resolve, reject);
      },
    };
    return q;
  };
  const client = {
    from: (table: string) => ({
      insert: (rows: unknown) => query(table, "insert", rows),
      update: (values: unknown) => query(table, "update", values),
      delete: () => query(table, "delete"),
    }),
  };
  return { state, client };
});
const createServiceClient = vi.hoisted(() => vi.fn());
vi.mock("../supabase/service", () => ({ createServiceClient }));

const { processSource, CHUNK_INSERT_BATCH_SIZE } = await import("./process");

const SECRET = "Our secret refund policy";
const input = { projectId: "p1", sourceId: "s1", text: `${SECRET}: 5 days.` };
const ok = (): Reply => ({ data: [{ id: "s1" }], error: null });

let errorLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fake.state.calls = [];
  fake.state.reply = ok;
  createServiceClient.mockReset();
  createServiceClient.mockReturnValue(fake.client);
  embedTexts.mockReset();
  embedTexts.mockImplementation((texts) => Promise.resolve(texts.map(() => [0.1, 0.2])));
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorLog.mockRestore());

const ops = () => fake.state.calls.map((c) => `${c.op} ${c.table}`);
const statusUpdates = () =>
  fake.state.calls.filter((c) => c.table === "knowledge_sources" && c.op === "update").map((c) => c.payload);

/** Asserts nothing logged contains the source text. */
function expectTextNotLogged() {
  expect(JSON.stringify(errorLog.mock.calls)).not.toContain("secret refund");
}

describe("processSource", () => {
  it("stores embedded chunks and marks the source ready", async () => {
    await expect(processSource(input)).resolves.toEqual({ status: "ready", chunkCount: 1 });

    expect(embedTexts).toHaveBeenCalledWith([`${SECRET}: 5 days.`]);
    expect(ops()).toEqual(["insert knowledge_chunks", "update knowledge_sources"]);
    const [insert, update] = fake.state.calls;
    expect(insert.payload).toEqual([
      { project_id: "p1", source_id: "s1", content: `${SECRET}: 5 days.`, embedding: "[0.1,0.2]" },
    ]);
    expect(update.payload).toEqual({ status: "ready" });
    expect(update.filters).toEqual([["id", "s1"], ["project_id", "p1"]]);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it("inserts chunks in batches", async () => {
    const text = Array.from({ length: CHUNK_INSERT_BATCH_SIZE + 30 }, (_, i) => `Para ${i}. ${"x".repeat(850)}`).join("\n\n");
    const result = await processSource({ ...input, text });
    expect(result).toEqual({ status: "ready", chunkCount: expect.any(Number) });
    const inserts = fake.state.calls.filter((c) => c.op === "insert");
    expect(inserts.length).toBe(2);
    expect((inserts[0].payload as unknown[]).length).toBe(CHUNK_INSERT_BATCH_SIZE);
    const total = inserts.reduce((n, c) => n + (c.payload as unknown[]).length, 0);
    expect(total).toBe(result.status === "ready" ? result.chunkCount : -1);
  });

  it("marks the source failed when embedding fails, without logging the text", async () => {
    embedTexts.mockRejectedValue(new Error("OpenAI is down"));
    await expect(processSource(input)).resolves.toEqual({ status: "failed" });

    expect(ops()).toEqual(["delete knowledge_chunks", "update knowledge_sources"]);
    expect(fake.state.calls[0].filters).toEqual([["source_id", "s1"], ["project_id", "p1"]]);
    expect(statusUpdates()).toEqual([{ status: "failed" }]);
    expect(errorLog).toHaveBeenCalledWith("Knowledge processing failed", {
      projectId: "p1",
      sourceId: "s1",
      error: { name: "Error", message: "OpenAI is down" },
    });
    expectTextNotLogged();
  });

  it("deletes partial chunks when a later insert batch fails", async () => {
    const text = Array.from({ length: CHUNK_INSERT_BATCH_SIZE + 5 }, (_, i) => `Para ${i}. ${"x".repeat(850)}`).join("\n\n");
    let inserts = 0;
    fake.state.reply = (call) => {
      if (call.op === "insert" && ++inserts === 2) {
        return { data: null, error: { name: "PostgrestError", code: "23514", message: "check failed", details: `Failing row contains (${SECRET})` } };
      }
      return ok();
    };

    await expect(processSource({ ...input, text })).resolves.toEqual({ status: "failed" });
    expect(ops()).toEqual([
      "insert knowledge_chunks",
      "insert knowledge_chunks",
      "delete knowledge_chunks",
      "update knowledge_sources",
    ]);
    expect(statusUpdates()).toEqual([{ status: "failed" }]);
    expect(errorLog.mock.calls[0][1]).toEqual({
      projectId: "p1",
      sourceId: "s1",
      error: { name: "PostgrestError", code: "23514", message: "check failed" },
    });
    expectTextNotLogged();
  });

  it("fails when the source no longer exists", async () => {
    fake.state.reply = (call) => (call.table === "knowledge_sources" && call.op === "update" && (call.payload as { status: string }).status === "ready" ? { data: [], error: null } : ok());
    await expect(processSource(input)).resolves.toEqual({ status: "failed" });
    expect(ops()).toEqual([
      "insert knowledge_chunks",
      "update knowledge_sources",
      "delete knowledge_chunks",
      "update knowledge_sources",
    ]);
  });

  it("fails on text with nothing to chunk without calling OpenAI", async () => {
    await expect(processSource({ ...input, text: " \n " })).resolves.toEqual({ status: "failed" });
    expect(embedTexts).not.toHaveBeenCalled();
    expect(statusUpdates()).toEqual([{ status: "failed" }]);
  });

  it("fails when OpenAI returns the wrong number of vectors", async () => {
    embedTexts.mockResolvedValue([]);
    await expect(processSource(input)).resolves.toEqual({ status: "failed" });
    expect(ops()).not.toContain("insert knowledge_chunks");
  });

  it("never throws, even if cleanup fails", async () => {
    embedTexts.mockRejectedValue(new Error("boom"));
    fake.state.reply = () => ({ data: null, error: { name: "PostgrestError", message: "db down" } });
    await expect(processSource(input)).resolves.toEqual({ status: "failed" });
    expect(errorLog).toHaveBeenCalledWith(
      "Knowledge processing cleanup incomplete",
      expect.objectContaining({ step: "delete chunks", sourceId: "s1" }),
    );
    expectTextNotLogged();
  });

  it("still marks the source failed when deleting its chunks fails", async () => {
    embedTexts.mockRejectedValue(new Error("boom"));
    fake.state.reply = (call) =>
      call.op === "delete" ? { data: null, error: { name: "PostgrestError", message: "delete failed" } } : ok();
    await expect(processSource(input)).resolves.toEqual({ status: "failed" });
    expect(ops()).toEqual(["delete knowledge_chunks", "update knowledge_sources"]);
    expect(statusUpdates()).toEqual([{ status: "failed" }]);
    expect(errorLog).toHaveBeenCalledWith(
      "Knowledge processing cleanup incomplete",
      expect.objectContaining({ step: "delete chunks", error: expect.objectContaining({ message: "delete failed" }) }),
    );
    expect(errorLog).not.toHaveBeenCalledWith(
      "Knowledge processing cleanup incomplete",
      expect.objectContaining({ step: "mark failed" }),
    );
  });

  it("returns failed, without rejecting, when the service client can't be created", async () => {
    createServiceClient.mockImplementation(() => {
      throw new Error("Missing env var");
    });
    await expect(processSource(input)).resolves.toEqual({ status: "failed" });
    expect(embedTexts).not.toHaveBeenCalled();
    expect(fake.state.calls).toEqual([]);
    expect(errorLog).toHaveBeenCalledWith("Knowledge processing failed", {
      projectId: "p1",
      sourceId: "s1",
      error: { name: "Error", message: "Missing env var" },
    });
  });
});
