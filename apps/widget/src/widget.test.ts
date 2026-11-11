import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { describe, expect, it, vi } from "vitest";
import { boot, isAllowedAppOrigin, loadConfig, NOT_RENDERING, type BootEnv } from "./widget";

const APP = "https://app.askwell.test";

function script(attrs: { src?: string; key?: string | null }) {
  return {
    src: attrs.src ?? `${APP}/widget.js`,
    getAttribute: (name: string) => (name === "data-key" ? (attrs.key ?? null) : null),
  } as unknown as HTMLScriptElement;
}

/** A document stub that records any attempt to change the page. */
function env(fetchFn: BootEnv["fetchFn"]) {
  const createElement = vi.fn(() => {
    throw new Error("rendered");
  });
  const append = vi.fn();
  const warn = vi.fn();
  const e = {
    doc: { createElement, body: { append } } as unknown as Document,
    win: {} as Window,
    fetchFn,
    warn,
  };
  return { e, createElement, append, warn };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("boot: bad key or failure renders nothing", () => {
  it.each([
    ["no data-key", script({ key: null })],
    ["a malformed key", script({ key: "sk_live_123" })],
    ["a key with spaces", script({ key: "pk_ab cd" })],
    ["no script", null],
    ["a non-http src", script({ key: "pk_abc", src: "file:///widget.js" })],
    ["a cleartext http app origin", script({ key: "pk_abc", src: "http://app.askwell.test/widget.js" })],
  ])("%s → no fetch, no DOM change, one warn", async (_label, s) => {
    const fetchFn = vi.fn();
    const { e, createElement, append, warn } = env(fetchFn);
    expect(await boot(s, e)).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(createElement).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledExactlyOnceWith(NOT_RENDERING);
  });

  it.each([
    ["404 unknown key", async () => json(404, { error: { code: "not_found", message: "x" } })],
    ["500", async () => json(500, {})],
    ["invalid config", async () => json(200, { config: { ...DEFAULT_WIDGET_CONFIG, buttonColor: "red" } })],
    ["non-JSON", async () => new Response("<html>", { status: 200 })],
    ["network error", async () => {
      throw new TypeError("Failed to fetch");
    }],
  ])("%s → no DOM change, one warn", async (_label, impl) => {
    const fetchFn = vi.fn(impl);
    const { e, createElement, append, warn } = env(fetchFn as unknown as BootEnv["fetchFn"]);
    expect(await boot(script({ key: "pk_abc" }), e)).toBe(false);
    expect(fetchFn).toHaveBeenCalledWith(`${APP}/api/widget/config?key=pk_abc`);
    expect(createElement).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("loadConfig", () => {
  it("fetches from the script's app origin and validates", async () => {
    const fetchFn = vi.fn(async () => json(200, { config: DEFAULT_WIDGET_CONFIG }));
    expect(await loadConfig(APP, "pk_a/b", fetchFn as unknown as typeof fetch)).toEqual(DEFAULT_WIDGET_CONFIG);
    expect(fetchFn).toHaveBeenCalledWith(`${APP}/api/widget/config?key=pk_a%2Fb`);
  });
});

describe("isAllowedAppOrigin", () => {
  it.each(["https://app.askwell.test", "https://x.vercel.app", "http://localhost:3000", "http://localhost", "http://127.0.0.1:3000"])(
    "allows %s",
    (o) => expect(isAllowedAppOrigin(o)).toBe(true),
  );
  it.each(["http://app.askwell.test", "http://localhost.evil.test", "http://127.0.0.1.evil.test", "file://", "null", ""])(
    "rejects %s",
    (o) => expect(isAllowedAppOrigin(o)).toBe(false),
  );
});
