import { describe, expect, it } from "vitest";
import {
  checkFile,
  FILE_ACCEPT,
  formatSize,
  isSettling,
  limitHint,
  pasteError,
  statusLabel,
  titleFromFileName,
  toKnowledgeSource,
  typeLabel,
  uploadError,
  usageText,
} from "./format";

const MB = 1024 * 1024;

describe("pasteError (mirrors createTextKnowledgeSchema)", () => {
  it("accepts a title and text", () => {
    expect(pasteError("Refunds", "5 days.")).toBeNull();
  });
  it.each([
    ["no title", "", "x", "Give the text a title."],
    ["a blank title", "   ", "x", "Give the text a title."],
    ["a 201-character title", "x".repeat(201), "x", "Keep the title under 201 characters."],
    ["no text", "T", "", "Paste some text."],
    ["blank text", "T", " \n ", "Paste some text."],
    ["text over 100,000 characters", "T", "x".repeat(100_001), "Text can be up to 100,000 characters. Split it into several sources."],
  ])("refuses %s", (_, title, text, message) => {
    expect(pasteError(title, text)).toBe(message);
  });
  it("counts the trimmed length, like the API", () => {
    expect(pasteError(` ${"x".repeat(200)} `, ` ${"y".repeat(100_000)} `)).toBeNull();
  });
});

describe("checkFile / uploadError", () => {
  it.each([
    ["manual.pdf", "pdf"],
    ["Manual.PDF", "pdf"],
    ["notes.md", "md"],
    ["faq.txt", "txt"],
  ])("accepts %s as %s", (name, ext) => {
    expect(checkFile({ name, size: 1000 })).toEqual({ ok: true, ext });
  });

  it.each([["setup.exe"], ["manual.pdf.exe"], ["README"], ["photo.png"], ["doc.docx"]])("refuses the type of %s", (name) => {
    expect(checkFile({ name, size: 1000 })).toEqual({
      ok: false,
      message: "Only PDF, Markdown (.md) and TXT files can be uploaded.",
    });
  });

  it("accepts exactly 10 MB and refuses one byte more, saying how big it is", () => {
    expect(checkFile({ name: "big.pdf", size: 10 * MB }).ok).toBe(true);
    expect(checkFile({ name: "big.pdf", size: 10 * MB + 1 })).toEqual({
      ok: false,
      message: "This file is 10.0 MB. Files can be up to 10 MB.",
    });
    expect(checkFile({ name: "big.pdf", size: 23.4 * MB })).toEqual({
      ok: false,
      message: "This file is 23.4 MB. Files can be up to 10 MB.",
    });
  });

  it("refuses an empty file", () => {
    expect(checkFile({ name: "a.txt", size: 0 })).toEqual({ ok: false, message: "This file is empty." });
  });

  it("needs a file and a title", () => {
    expect(uploadError("T", null)).toBe("Choose a file.");
    expect(uploadError(" ", { name: "a.pdf", size: 5 })).toBe("Give the file a title.");
    expect(uploadError("x".repeat(201), { name: "a.pdf", size: 5 })).toBe("Keep the title under 201 characters.");
    expect(uploadError("T", { name: "a.exe", size: 5 })).toMatch(/Only PDF/);
    expect(uploadError("T", { name: "a.pdf", size: 5 })).toBeNull();
  });

  it("offers the same types in the file picker", () => {
    expect(FILE_ACCEPT).toBe(".pdf,.md,.txt,application/pdf,text/markdown,text/plain");
  });
});

describe("labels", () => {
  it("shows uploading and processing as Processing", () => {
    expect(statusLabel("uploading")).toBe("Processing");
    expect(statusLabel("processing")).toBe("Processing");
    expect(statusLabel("ready")).toBe("Ready");
    expect(statusLabel("failed")).toBe("Failed");
    expect([isSettling("uploading"), isSettling("processing"), isSettling("ready"), isSettling("failed")]).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it("names each type", () => {
    expect(["text", "pdf", "md", "txt"].map((t) => typeLabel(t as never))).toEqual(["Text", "PDF", "Markdown", "TXT"]);
  });

  it("shows usage against the plan's limit from PLAN_LIMITS", () => {
    expect(usageText(2, "free")).toBe("2 of 3 sources used");
    expect(usageText(3, "pro")).toBe("3 of 25 sources used");
  });

  it("explains the limit per plan", () => {
    expect(limitHint("free")).toBe("Free includes 3 sources per project. Upgrade to Pro for 25, or delete one.");
    expect(limitHint("pro")).toMatch(/Delete one to add another/);
  });

  it("makes a title from a file name", () => {
    expect(titleFromFileName("Refund policy.pdf")).toBe("Refund policy");
    expect(titleFromFileName(".env")).toBe(".env");
    expect(titleFromFileName(`${"a".repeat(300)}.md`)).toHaveLength(200);
  });

  it("formats sizes", () => {
    expect(formatSize(830 * 1024)).toBe("830 KB");
    expect(formatSize(100)).toBe("1 KB");
    expect(formatSize(2.4 * MB)).toBe("2.4 MB");
  });
});

describe("toKnowledgeSource", () => {
  const row = { id: "s1", project_id: "p1", title: "T", type: "pdf", status: "ready", created_at: "2026-11-12T10:00:00Z" };
  it("maps a row", () => {
    expect(toKnowledgeSource(row)).toEqual({ id: "s1", projectId: "p1", title: "T", type: "pdf", status: "ready", createdAt: "2026-11-12T10:00:00Z" });
  });
  it("skips unknown values", () => {
    expect(toKnowledgeSource({ ...row, type: "docx" })).toBeNull();
    expect(toKnowledgeSource({ ...row, status: "queued" })).toBeNull();
  });
});
