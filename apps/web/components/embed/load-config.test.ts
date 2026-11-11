import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { describe, expect, it, vi } from "vitest";
import { loadWidgetConfig } from "./load-config";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("loadWidgetConfig", () => {
  it("fetches the same-origin config route with the encoded key", async () => {
    const fetchFn = vi.fn(async () => json(200, { config: DEFAULT_WIDGET_CONFIG }));
    expect(await loadWidgetConfig("pk_abc", fetchFn)).toEqual(DEFAULT_WIDGET_CONFIG);
    expect(fetchFn).toHaveBeenCalledWith("/api/widget/config?key=pk_abc", expect.anything());
  });

  it.each([
    ["404 unknown key", () => json(404, { error: { code: "not_found", message: "x" } })],
    ["400 bad key", () => json(400, { error: { code: "validation", message: "x" } })],
    ["500", () => json(500, {})],
    ["a body without config", () => json(200, { nope: true })],
    ["an invalid config", () => json(200, { config: { ...DEFAULT_WIDGET_CONFIG, buttonColor: "red" } })],
    ["non-JSON", () => new Response("<html>", { status: 200 })],
  ])("returns null for %s", async (_label, respond) => {
    expect(await loadWidgetConfig("pk_abc", vi.fn(async () => respond()))).toBeNull();
  });

  it("returns null on a network error", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await loadWidgetConfig("pk_abc", fetchFn)).toBeNull();
  });
});
