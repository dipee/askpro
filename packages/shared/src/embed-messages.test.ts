import { describe, expect, it } from "vitest";
import {
  EMBED_MESSAGE_TYPES,
  MAX_EMBED_HEIGHT_PX,
  MAX_EMBED_UNREAD,
  isEmbedMessage,
  parseEmbedMessage,
} from "./embed-messages";
import * as shared from "./index";

describe("EMBED_MESSAGE_TYPES", () => {
  it("is namespaced", () => {
    expect(EMBED_MESSAGE_TYPES).toEqual({
      close: "askwell:close",
      resize: "askwell:resize",
      unread: "askwell:unread",
    });
  });

  it("is exported from the package index", () => {
    expect(shared.EMBED_MESSAGE_TYPES).toBe(EMBED_MESSAGE_TYPES);
    expect(shared.parseEmbedMessage).toBe(parseEmbedMessage);
  });
});

describe("parseEmbedMessage", () => {
  it.each([
    [{ type: "askwell:close" }],
    [{ type: "askwell:resize", height: 560 }],
    [{ type: "askwell:resize", height: MAX_EMBED_HEIGHT_PX }],
    [{ type: "askwell:unread", count: 0 }],
    [{ type: "askwell:unread", count: MAX_EMBED_UNREAD }],
  ])("accepts %j", (msg) => {
    expect(parseEmbedMessage(msg)).toEqual(msg);
    expect(isEmbedMessage(msg)).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "askwell:close"],
    ["an unnamespaced type", { type: "close" }],
    ["another namespace", { type: "other:close" }],
    ["an unknown type", { type: "askwell:open" }],
    ["resize without height", { type: "askwell:resize" }],
    ["resize with a string height", { type: "askwell:resize", height: "560" }],
    ["resize with zero height", { type: "askwell:resize", height: 0 }],
    ["resize too tall", { type: "askwell:resize", height: MAX_EMBED_HEIGHT_PX + 1 }],
    ["resize with a fractional height", { type: "askwell:resize", height: 10.5 }],
    ["unread negative", { type: "askwell:unread", count: -1 }],
    ["unread too large", { type: "askwell:unread", count: MAX_EMBED_UNREAD + 1 }],
    ["extra fields", { type: "askwell:close", html: "<b>x</b>" }],
  ])("rejects %s", (_label, msg) => {
    expect(parseEmbedMessage(msg)).toBeNull();
    expect(isEmbedMessage(msg)).toBe(false);
  });
});
