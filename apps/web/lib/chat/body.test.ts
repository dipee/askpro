import { describe, expect, it } from "vitest";
import { MAX_CHAT_BODY_BYTES, readJsonBodyCapped } from "./body";

const URL_ = "https://askwell.test/api/widget/chat";

/** A request whose body arrives in chunks with no Content-Length (chunked encoding). */
function chunkedRequest(chunks: string[]) {
  const encoder = new TextEncoder();
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks[pulled++];
      if (next === undefined) controller.close();
      else controller.enqueue(encoder.encode(next));
    },
  });
  const request = new Request(URL_, { method: "POST", body: stream, duplex: "half" } as RequestInit);
  return { request, pulled: () => pulled };
}

describe("readJsonBodyCapped", () => {
  it("parses a normal JSON body", async () => {
    const request = new Request(URL_, { method: "POST", body: JSON.stringify({ message: "Hi" }) });
    await expect(readJsonBodyCapped(request)).resolves.toEqual({ ok: true, value: { message: "Hi" } });
  });

  it("accepts a body of exactly the cap", async () => {
    const body = JSON.stringify({ m: "a".repeat(MAX_CHAT_BODY_BYTES - 8) });
    expect(new TextEncoder().encode(body).byteLength).toBe(MAX_CHAT_BODY_BYTES);
    await expect(readJsonBodyCapped(new Request(URL_, { method: "POST", body }))).resolves.toMatchObject({ ok: true });
  });

  it("refuses a declared Content-Length over the cap without reading the body", async () => {
    const request = new Request(URL_, {
      method: "POST",
      headers: { "content-length": String(MAX_CHAT_BODY_BYTES + 1) },
      body: "{}",
    });
    await expect(readJsonBodyCapped(request)).resolves.toEqual({ ok: false, reason: "too_large" });
    expect(request.bodyUsed).toBe(false);
  });

  it("stops reading a chunked body as soon as it passes the cap", async () => {
    const chunk = "a".repeat(4096);
    const { request, pulled } = chunkedRequest(Array.from({ length: 100 }, () => chunk));
    await expect(readJsonBodyCapped(request)).resolves.toEqual({ ok: false, reason: "too_large" });
    expect(pulled()).toBeLessThanOrEqual(MAX_CHAT_BODY_BYTES / 4096 + 2);
  });

  it("parses a chunked body under the cap", async () => {
    const { request } = chunkedRequest(['{"mess', 'age":"Hi"}']);
    await expect(readJsonBodyCapped(request)).resolves.toEqual({ ok: true, value: { message: "Hi" } });
  });

  it.each([
    ["invalid JSON", "not json"],
    ["an empty body", ""],
  ])("reports %s", async (_, body) => {
    await expect(readJsonBodyCapped(new Request(URL_, { method: "POST", body }))).resolves.toEqual({
      ok: false,
      reason: "invalid_json",
    });
  });

  it("reports a missing body as invalid JSON", async () => {
    await expect(readJsonBodyCapped(new Request(URL_, { method: "POST" }))).resolves.toEqual({
      ok: false,
      reason: "invalid_json",
    });
  });
});
