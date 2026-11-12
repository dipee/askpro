import "server-only";
import OpenAI from "openai";
import { required } from "../supabase/env";

/** Embedding model. Its 1536 dimensions match `chunks.embedding` (vector(1536)). */
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
/** Chat model (product owner's choice). */
export const CHAT_MODEL = "gpt-4.1-mini";
/** Inputs per embeddings request. Well under OpenAI's per-request input and token limits for ~1k-token chunks. */
export const EMBED_BATCH_SIZE = 100;

let client: OpenAI | undefined;

/** The server's OpenAI client, created on first use from OPENAI_API_KEY. */
export function openai(): OpenAI {
  client ??= new OpenAI({ apiKey: required(process.env.OPENAI_API_KEY, "OPENAI_API_KEY") });
  return client;
}

/**
 * Embeds texts in batches of EMBED_BATCH_SIZE. Returns one vector per input, in
 * input order. Throws if any vector isn't EMBEDDING_DIMENSIONS long.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBED_BATCH_SIZE);
    const res = await openai().embeddings.create({ model: EMBEDDING_MODEL, input: batch, encoding_format: "float" });
    if (res.data.length !== batch.length) {
      throw new Error(`Expected ${batch.length} embeddings, got ${res.data.length}`);
    }
    const ordered = [...res.data].sort((a, b) => a.index - b.index);
    for (const item of ordered) {
      if (item.embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Expected a ${EMBEDDING_DIMENSIONS}-dimension embedding, got ${item.embedding.length}`);
      }
      vectors.push(item.embedding);
    }
  }
  return vectors;
}
