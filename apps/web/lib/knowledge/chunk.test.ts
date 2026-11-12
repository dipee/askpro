import { describe, expect, it } from "vitest";
import { CHUNK_MAX_CHARS, CHUNK_MIN_CHARS, chunkText } from "./chunk";

/** A sentence of exactly `n` characters ending in ". " (trimmed at the end of the text). */
const sentence = (n: number, ch = "a") => `${ch.repeat(n - 2)}. `;

describe("chunkText", () => {
  it("returns no chunks for empty or blank text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("  \n\n\t ")).toEqual([]);
  });

  it("returns short text as one trimmed chunk", () => {
    expect(chunkText("  Refunds take 5 days.\r\n")).toEqual(["Refunds take 5 days."]);
  });

  it("keeps text of exactly the max length in one chunk", () => {
    const text = "x".repeat(CHUNK_MAX_CHARS);
    expect(chunkText(text)).toEqual([text]);
  });

  it("cuts long text with no breaks hard at the max length, with overlap", () => {
    const text = Array.from({ length: 2500 }, (_, i) => String.fromCharCode(97 + (i % 26))).join("");
    const chunks = chunkText(text);
    expect(chunks.length).toBe(3);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
    expect(chunks[0]).toBe(text.slice(0, 1000));
    expect(chunks[1]).toBe(text.slice(850, 1850));
    expect(chunks[2]).toBe(text.slice(1700));
  });

  it("never splits a surrogate pair on a hard cut", () => {
    const text = "😀".repeat(1500); // 3,000 UTF-16 units, no breaks
    for (const c of chunkText(text)) {
      expect(c).toMatch(/^(😀)+$/u);
      expect(c.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
    }
  });

  it("prefers a paragraph break over a later sentence break", () => {
    const para1 = sentence(450) + sentence(400); // 850 chars, ends a paragraph
    const text = `${para1.trim()}\n\n${sentence(100, "b")}${sentence(1000, "c")}`;
    const [first] = chunkText(text);
    expect(first).toBe(para1.trim());
  });

  it("prefers a sentence break over a word break", () => {
    const text = `${"word ".repeat(170)}End here. ${"more words ".repeat(100)}`;
    const [first] = chunkText(text);
    expect(first.endsWith("End here.")).toBe(true);
  });

  it("ignores breaks before the minimum size", () => {
    const text = `Short.\n\n${"w ".repeat(1000)}`;
    const [first] = chunkText(text);
    expect(first.length).toBeGreaterThanOrEqual(CHUNK_MIN_CHARS - 1);
    expect(first.startsWith("Short.")).toBe(true);
  });

  it("overlaps each chunk with the end of the one before, starting on a word", () => {
    const words = Array.from({ length: 600 }, (_, i) => `w${i}`).join(" ");
    const chunks = chunkText(words);
    expect(chunks.length).toBeGreaterThan(2);
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const firstWord = chunks[i].split(" ")[0];
      expect(prev.split(" ")).toContain(firstWord); // overlap, whole word
      const overlap = prev.length - prev.lastIndexOf(` ${firstWord} `);
      expect(overlap).toBeGreaterThan(50);
      expect(overlap).toBeLessThanOrEqual(160);
    }
    // Every word survives.
    const seen = new Set(chunks.flatMap((c) => c.split(" ")));
    expect(seen.size).toBe(600);
  });

  it("keeps every chunk within the size bounds on realistic text", () => {
    const text = Array.from({ length: 80 }, (_, i) => `Paragraph ${i}. ${"Some sentence here. ".repeat(i % 7 + 1)}`).join("\n\n");
    const chunks = chunkText(text);
    chunks.forEach((c, i) => {
      expect(c.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
      if (i < chunks.length - 1) expect(c.length).toBeGreaterThan(CHUNK_MIN_CHARS - 10);
      expect(c.trim()).toBe(c);
    });
  });
});
