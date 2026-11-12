import { afterEach, describe, expect, it, vi } from "vitest";
import { putFile, UPLOAD_TIMEOUT_MS } from "./api";

/** A minimal XMLHttpRequest stand-in: the test fires its events. */
class FakeXhr {
  static last: FakeXhr;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  status = 0;
  timeout = 0;
  body: unknown;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.body = body;
  }
}

afterEach(() => vi.unstubAllGlobals());

function start(ext: "pdf" | "md" | "txt" = "md") {
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  const progress: number[] = [];
  const done = putFile("https://storage.test/sign?token=t", new Blob(["# hi"]), ext, (p) => progress.push(p));
  return { xhr: FakeXhr.last, done, progress };
}

describe("putFile", () => {
  it("PUTs the file with the content type from its extension (browsers leave .md empty)", async () => {
    const { xhr, done } = start("md");
    expect(xhr.method).toBe("PUT");
    expect(xhr.url).toBe("https://storage.test/sign?token=t");
    expect(xhr.headers).toEqual({ "Content-Type": "text/markdown" });
    xhr.status = 200;
    xhr.onload?.();
    await expect(done).resolves.toEqual({ ok: true, data: null });
  });

  it("reports progress", async () => {
    const { xhr, done, progress } = start();
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 });
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 50, total: 0 });
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
    xhr.status = 200;
    xhr.onload?.();
    await done;
    expect(progress).toEqual([0.25, 1]);
  });

  it("has a deadline: a stalled upload resolves through the error path", async () => {
    const { xhr, done } = start();
    expect(xhr.timeout).toBe(UPLOAD_TIMEOUT_MS);
    xhr.ontimeout?.();
    await expect(done).resolves.toEqual({
      ok: false,
      code: "network",
      message: "The upload timed out. Check your connection and try again.",
    });
  });

  it.each([
    ["a non-2xx answer", (x: FakeXhr) => ((x.status = 400), x.onload?.()), "internal"],
    ["a network error", (x: FakeXhr) => x.onerror?.(), "network"],
    ["an abort", (x: FakeXhr) => x.onabort?.(), "network"],
  ])("fails on %s", async (_, fire, code) => {
    const { xhr, done } = start();
    fire(xhr);
    await expect(done).resolves.toMatchObject({ ok: false, code });
  });
});
