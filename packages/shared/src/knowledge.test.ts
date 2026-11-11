import { describe, expect, it } from "vitest";
import { MAX_KNOWLEDGE_FILE_BYTES, uploadExtension } from "./knowledge";

describe("knowledge limits", () => {
  it("max file is 10 MB", () => expect(MAX_KNOWLEDGE_FILE_BYTES).toBe(10 * 1024 * 1024));
});

describe("uploadExtension", () => {
  it.each([
    ["Guide.PDF", "pdf"],
    ["notes.md", "md"],
    ["a.b.txt", "txt"],
  ])("%s → %s", (name, ext) => expect(uploadExtension(name)).toBe(ext));
  it.each(["file.docx", "pdf", ".txt", "noext"])("rejects %s", (name) =>
    expect(uploadExtension(name)).toBeNull(),
  );
});
