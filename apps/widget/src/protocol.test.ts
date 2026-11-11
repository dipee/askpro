import {
  DEFAULT_WIDGET_CONFIG,
  parseEmbedMessage,
  publicKeySchema,
  widgetConfigSchema,
} from "@askwell/shared";
import { describe, expect, it } from "vitest";
import { isPublicKey, parseConfig, parseMessage } from "./protocol";

// The loader can't bundle zod (5 kb budget), so its guards must agree with
// packages/shared's zod validators exactly.
const MESSAGES: unknown[] = [
  { type: "askwell:close" },
  { type: "askwell:resize", height: 560 },
  { type: "askwell:resize", height: 1 },
  { type: "askwell:resize", height: 2000 },
  { type: "askwell:resize", height: 2001 },
  { type: "askwell:resize", height: 0 },
  { type: "askwell:resize", height: 10.5 },
  { type: "askwell:resize", height: "560" },
  { type: "askwell:resize" },
  { type: "askwell:unread", count: 0 },
  { type: "askwell:unread", count: 999 },
  { type: "askwell:unread", count: 1000 },
  { type: "askwell:unread", count: -1 },
  { type: "askwell:close", extra: 1 },
  { type: "close" },
  { type: "other:close" },
  { type: "askwell:open" },
  "askwell:close",
  null,
  undefined,
  42,
  [],
  [{ type: "askwell:close" }],
];

describe("parseMessage matches shared parseEmbedMessage", () => {
  it.each(MESSAGES.map((m) => [JSON.stringify(m) ?? String(m), m]))("%s", (_label, msg) => {
    expect(parseMessage(msg)).toEqual(parseEmbedMessage(msg));
  });
});

const zodConfig = (body: unknown) => {
  if (typeof body !== "object" || body === null || !("config" in body)) return null;
  const r = widgetConfigSchema.safeParse(body.config);
  return r.success ? r.data : null;
};
const D = DEFAULT_WIDGET_CONFIG;
const CONFIGS: unknown[] = [
  { config: D },
  { config: { ...D, buttonColor: "#ABCDEF", position: "top-left", animation: "scale", showBadge: false } },
  { config: { ...D, label: "  Help  " } },
  { config: { ...D, label: "x".repeat(30) } },
  { config: { ...D, label: "x".repeat(31) } },
  { config: { ...D, label: "   " } },
  { config: { ...D, headerText: "h".repeat(61) } },
  { config: { ...D, buttonColor: "red" } },
  { config: { ...D, buttonColor: "#abc" } },
  { config: { ...D, position: "middle" } },
  { config: { ...D, animation: "spin" } },
  { config: { ...D, showBadge: "yes" } },
  { config: { ...D, label: 5 } },
  { config: null },
  {},
  null,
];

describe("parseConfig matches shared widgetConfigSchema", () => {
  it.each(CONFIGS.map((c, i) => [i, c]))("case %i", (_i, body) => {
    expect(parseConfig(body)).toEqual(zodConfig(body));
  });
});

describe("isPublicKey matches shared publicKeySchema", () => {
  it.each(["pk_abc", "pk_A-b_9", `pk_${"a".repeat(64)}`, `pk_${"a".repeat(65)}`, "pk_", "sk_abc", "pk_a b", "", null, 1])(
    "%s",
    (key) => {
      expect(isPublicKey(key)).toBe(publicKeySchema.safeParse(key).success);
    },
  );
});
