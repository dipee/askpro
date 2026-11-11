import { build } from "esbuild";
import { describe, expect, it } from "vitest";

/** project.md §3: the loader stays under 5 kb minified. */
const LIMIT_BYTES = 5 * 1024;

describe("widget.js bundle", () => {
  it(`is under ${LIMIT_BYTES} bytes minified and doesn't bundle zod`, async () => {
    const result = await build({
      entryPoints: [decodeURIComponent(new URL("./index.ts", import.meta.url).pathname)],
      bundle: true,
      minify: true,
      format: "iife",
      target: "es2018",
      write: false,
      logLevel: "silent",
    });
    const code = result.outputFiles[0]!.text;
    expect(code.length).toBeLessThan(LIMIT_BYTES);
    expect(code).not.toMatch(/ZodError|zod/i);
  });
});
