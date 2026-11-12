import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { extractText, ExtractError } = await import("./extract");

const fixture = async (name: string) => new Uint8Array(await readFile(new URL(`./fixtures/${name}`, import.meta.url)));
const utf8 = (s: string) => new TextEncoder().encode(s);

describe("extractText", () => {
  it("reads text from a PDF", async () => {
    await expect(extractText(await fixture("hello.pdf"), "pdf")).resolves.toBe("Askwell refunds take 5 days.");
  });

  it("doesn't detach the caller's PDF buffer", async () => {
    const bytes = await fixture("hello.pdf");
    await extractText(bytes, "pdf");
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("rejects a PDF with no text", async () => {
    await expect(extractText(await fixture("blank.pdf"), "pdf")).rejects.toBeInstanceOf(ExtractError);
  });

  it("rejects bytes that aren't a PDF", async () => {
    await expect(extractText(utf8("not a pdf"), "pdf")).rejects.toThrow("The PDF could not be read.");
  });

  it("decodes Markdown as UTF-8", async () => {
    await expect(extractText(utf8("# Héllo\n\nRefunds — 5 days 😀\n"), "md")).resolves.toBe("# Héllo\n\nRefunds — 5 days 😀");
  });

  it("decodes TXT as UTF-8, dropping a BOM and NUL characters", async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8("plain\u0000 text")]);
    await expect(extractText(bytes, "txt")).resolves.toBe("plain text");
  });

  it("rejects invalid UTF-8", async () => {
    await expect(extractText(new Uint8Array([0x61, 0xff, 0x62]), "txt")).rejects.toThrow("not valid UTF-8");
  });

  it("rejects an empty or blank file", async () => {
    await expect(extractText(new Uint8Array(), "txt")).rejects.toBeInstanceOf(ExtractError);
    await expect(extractText(utf8(" \n\t\u0000 "), "md")).rejects.toThrow("no text");
  });
});
