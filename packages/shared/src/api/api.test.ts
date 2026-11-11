import { describe, expect, it } from "vitest";
import { MAX_KNOWLEDGE_FILE_BYTES, MAX_KNOWLEDGE_TEXT_CHARS } from "../knowledge";
import { MAX_CHAT_MESSAGE_CHARS } from "../messages";
import { idParamsSchema, publicKeySchema } from "./common";
import { updateWidgetConfigSchema } from "./config";
import {
  createTextKnowledgeSchema,
  finalizeKnowledgeSchema,
  knowledgeUploadUrlSchema,
} from "./knowledge";
import { createProjectSchema, updateProjectSchema } from "./projects";
import { chatRequestSchema, widgetConfigQuerySchema } from "./widget";

const UUID = "3f0c9a52-6b1e-4c2d-9f7a-1b2c3d4e5f60";
const KEY = "pk_a1B2c3D4e5";

type Schema = { safeParse: (v: unknown) => { success: boolean } };
const cases: [string, Schema, unknown, unknown][] = [
  ["idParamsSchema", idParamsSchema, { id: UUID }, { id: "1" }],
  ["publicKeySchema", publicKeySchema, KEY, "sk_secret"],
  ["widgetConfigQuerySchema", widgetConfigQuerySchema, { key: KEY }, {}],
  [
    "chatRequestSchema",
    chatRequestSchema,
    { key: KEY, visitorId: "v_12345678", message: "Hi" },
    { key: KEY, visitorId: "v_12345678", message: "x".repeat(MAX_CHAT_MESSAGE_CHARS + 1) },
  ],
  ["createProjectSchema", createProjectSchema, { name: "My site" }, { name: "   " }],
  ["updateProjectSchema", updateProjectSchema, { name: "Renamed" }, { name: "x".repeat(61) }],
  [
    "createTextKnowledgeSchema",
    createTextKnowledgeSchema,
    { title: "FAQ", text: "We ship worldwide." },
    { title: "FAQ", text: "x".repeat(MAX_KNOWLEDGE_TEXT_CHARS + 1) },
  ],
  [
    "knowledgeUploadUrlSchema",
    knowledgeUploadUrlSchema,
    { title: "Manual", fileName: "manual.pdf", size: 1024 },
    { title: "Manual", fileName: "manual.pdf", size: MAX_KNOWLEDGE_FILE_BYTES + 1 },
  ],
  ["finalizeKnowledgeSchema", finalizeKnowledgeSchema, { sourceId: UUID }, { sourceId: "abc" }],
  ["updateWidgetConfigSchema", updateWidgetConfigSchema, { buttonColor: "#ff0000" }, {}],
];

describe.each(cases)("%s", (_name, schema, valid, invalid) => {
  it("accepts a valid input", () => expect(schema.safeParse(valid).success).toBe(true));
  it("rejects an invalid input", () => expect(schema.safeParse(invalid).success).toBe(false));
});

describe("extra edge cases", () => {
  it("chat accepts exactly the max length", () =>
    expect(
      chatRequestSchema.safeParse({
        key: KEY,
        visitorId: "v_12345678",
        conversationId: UUID,
        message: "x".repeat(MAX_CHAT_MESSAGE_CHARS),
      }).success,
    ).toBe(true));
  it("upload rejects a .docx file", () =>
    expect(
      knowledgeUploadUrlSchema.safeParse({ title: "Doc", fileName: "a.docx", size: 10 }).success,
    ).toBe(false));
  it("config rejects a bad color", () =>
    expect(updateWidgetConfigSchema.safeParse({ buttonColor: "blue" }).success).toBe(false));
});
