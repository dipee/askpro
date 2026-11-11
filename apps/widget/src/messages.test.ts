import { describe, expect, it, vi } from "vitest";
import { createMessageHandler } from "./messages";

const APP = "https://app.askwell.test";
const frameWin = { name: "panel" };

function setup() {
  const h = { onClose: vi.fn(), onResize: vi.fn(), onUnread: vi.fn() };
  const handle = createMessageHandler({ appOrigin: APP, frameWindow: () => frameWin, ...h });
  const calls = () => h.onClose.mock.calls.length + h.onResize.mock.calls.length + h.onUnread.mock.calls.length;
  return { h, handle, calls };
}

describe("createMessageHandler", () => {
  it.each([
    "https://evil.test",
    "http://app.askwell.test",
    "https://app.askwell.test.evil.test",
    "https://shop.example.com",
    "null",
    "",
  ])("ignores messages from origin %s", (origin) => {
    const { handle, calls } = setup();
    handle({ origin, source: frameWin, data: { type: "askwell:close" } });
    expect(calls()).toBe(0);
  });

  it("ignores the app origin when the source isn't our iframe", () => {
    const { handle, calls } = setup();
    handle({ origin: APP, source: { name: "another frame" }, data: { type: "askwell:close" } });
    handle({ origin: APP, source: null, data: { type: "askwell:close" } });
    expect(calls()).toBe(0);
  });

  it("ignores everything before the iframe exists", () => {
    const onClose = vi.fn();
    const handle = createMessageHandler({ appOrigin: APP, frameWindow: () => undefined, onClose, onResize: vi.fn(), onUnread: vi.fn() });
    handle({ origin: APP, source: undefined, data: { type: "askwell:close" } });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores invalid data from our iframe", () => {
    const { handle, calls } = setup();
    for (const data of [{ type: "close" }, { type: "askwell:resize", height: -1 }, "<b>x</b>", null]) {
      handle({ origin: APP, source: frameWin, data });
    }
    expect(calls()).toBe(0);
  });

  it("handles close, resize and unread from our iframe", () => {
    const { h, handle } = setup();
    handle({ origin: APP, source: frameWin, data: { type: "askwell:close" } });
    handle({ origin: APP, source: frameWin, data: { type: "askwell:resize", height: 480 } });
    handle({ origin: APP, source: frameWin, data: { type: "askwell:unread", count: 3 } });
    expect(h.onClose).toHaveBeenCalledOnce();
    expect(h.onResize).toHaveBeenCalledWith(480);
    expect(h.onUnread).toHaveBeenCalledWith(3);
  });
});
