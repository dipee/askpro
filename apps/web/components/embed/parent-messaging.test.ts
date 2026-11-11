import { describe, expect, it, vi } from "vitest";
import { createParentMessageHandler, parseParentOrigin, postToParent } from "./parent-messaging";

const HOST = "https://shop.example.com";

describe("parseParentOrigin", () => {
  it.each([
    [HOST, HOST],
    [`${HOST}/`, HOST],
    ["http://localhost:5173", "http://localhost:5173"],
  ])("accepts %s", (input, expected) => {
    expect(parseParentOrigin(input)).toBe(expected);
  });

  it.each([null, undefined, "", "*", "null", "shop.example.com", `${HOST}/path`, `${HOST}?x=1`, "javascript:alert(1)", "file:///etc", "https://user:pw@shop.example.com"])(
    "rejects %s",
    (input) => {
      expect(parseParentOrigin(input)).toBeNull();
    },
  );
});

describe("postToParent", () => {
  it("posts close with the host origin as targetOrigin, never *", () => {
    const target = { postMessage: vi.fn() };
    expect(postToParent(target, HOST, { type: "askwell:close" })).toBe(true);
    expect(target.postMessage).toHaveBeenCalledExactlyOnceWith({ type: "askwell:close" }, HOST);
    expect(target.postMessage.mock.calls.flat()).not.toContain("*");
  });

  it("sends nothing without a valid origin or a parent", () => {
    const target = { postMessage: vi.fn() };
    expect(postToParent(target, null, { type: "askwell:close" })).toBe(false);
    expect(postToParent(null, HOST, { type: "askwell:close" })).toBe(false);
    expect(target.postMessage).not.toHaveBeenCalled();
  });
});

describe("createParentMessageHandler", () => {
  it("ignores messages from any other origin", () => {
    const onMessage = vi.fn();
    const handle = createParentMessageHandler(HOST, onMessage);
    handle({ origin: "https://evil.example", data: { type: "askwell:close" } });
    handle({ origin: "https://shop.example.com.evil.example", data: { type: "askwell:close" } });
    handle({ origin: "http://shop.example.com", data: { type: "askwell:close" } });
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("ignores everything without a valid parent origin", () => {
    const onMessage = vi.fn();
    const handle = createParentMessageHandler(null, onMessage);
    handle({ origin: HOST, data: { type: "askwell:close" } });
    handle({ origin: "null", data: { type: "askwell:close" } });
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("ignores invalid data from the right origin", () => {
    const onMessage = vi.fn();
    const handle = createParentMessageHandler(HOST, onMessage);
    handle({ origin: HOST, data: "<b>x</b>" });
    handle({ origin: HOST, data: { type: "close" } });
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("passes valid messages from the host origin", () => {
    const onMessage = vi.fn();
    const handle = createParentMessageHandler(HOST, onMessage);
    handle({ origin: HOST, data: { type: "askwell:unread", count: 2 } });
    expect(onMessage).toHaveBeenCalledExactlyOnceWith({ type: "askwell:unread", count: 2 });
  });
});
