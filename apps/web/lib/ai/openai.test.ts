import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CreateArgs = { model: string; input: string[] };
const create = vi.hoisted(() => vi.fn());
const OpenAI = vi.hoisted(() => vi.fn(function (this: unknown) {
  return { embeddings: { create } };
}));

vi.mock("server-only", () => ({}));
vi.mock("openai", () => ({ default: OpenAI }));

const { embedTexts, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, EMBED_BATCH_SIZE, CHAT_MODEL } = await import("./openai");

/** A fake vector whose first value identifies the input text's number. */
const vec = (n: number, dims = EMBEDDING_DIMENSIONS) => Array.from({ length: dims }, (_, i) => (i === 0 ? n : 0));

/** Replies like OpenAI, but with `data` reversed to prove we reorder by `index`. */
function fakeEmbeddings({ input }: CreateArgs) {
  const data = input.map((text, index) => ({ index, embedding: vec(Number(text)) }));
  return Promise.resolve({ data: data.reverse() });
}

beforeEach(() => {
  create.mockReset();
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
});
afterEach(() => vi.unstubAllEnvs());

describe("embedTexts", () => {
  it("uses the agreed models", () => {
    expect(EMBEDDING_MODEL).toBe("text-embedding-3-small");
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
    expect(CHAT_MODEL).toBe("gpt-4.1-mini");
  });

  it("returns [] for no input without calling OpenAI", async () => {
    await expect(embedTexts([])).resolves.toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });

  it("batches inputs and returns vectors in input order", async () => {
    create.mockImplementation(fakeEmbeddings);
    const texts = Array.from({ length: EMBED_BATCH_SIZE * 2 + 5 }, (_, i) => String(i));
    const vectors = await embedTexts(texts);

    expect(create).toHaveBeenCalledTimes(3);
    const batches = create.mock.calls.map(([args]) => (args as CreateArgs).input);
    expect(batches.map((b) => b.length)).toEqual([EMBED_BATCH_SIZE, EMBED_BATCH_SIZE, 5]);
    expect(batches.flat()).toEqual(texts);
    for (const [args] of create.mock.calls) expect((args as CreateArgs).model).toBe(EMBEDDING_MODEL);

    expect(vectors.map((v) => v[0])).toEqual(texts.map(Number));
    expect(OpenAI).toHaveBeenCalledOnce();
    expect(OpenAI).toHaveBeenCalledWith({ apiKey: "sk-test" });
  });

  it("throws when a vector isn't 1536 long", async () => {
    create.mockResolvedValue({ data: [{ index: 0, embedding: vec(0, 3) }] });
    await expect(embedTexts(["0"])).rejects.toThrow(/1536-dimension/);
  });

  it("throws when OpenAI returns the wrong number of vectors", async () => {
    create.mockResolvedValue({ data: [{ index: 0, embedding: vec(0) }] });
    await expect(embedTexts(["0", "1"])).rejects.toThrow(/Expected 2 embeddings, got 1/);
  });

  it("is server-only", async () => {
    const source = await readFile(fileURLToPath(new URL("./openai.ts", import.meta.url)), "utf8");
    expect(source.split("\n")[0]).toBe('import "server-only";');
  });
});
