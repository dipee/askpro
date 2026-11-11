import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

function stubPage(key: string) {
  const win: { __askwellWidget?: boolean; fetch: () => Promise<Response> } = {
    fetch: async () => new Response("{}", { status: 404 }),
  };
  const script = { src: "https://app.askwell.test/widget.js", getAttribute: () => key };
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", { currentScript: script, body: {}, querySelector: () => null });
  vi.stubGlobal("console", { ...console, warn: vi.fn() });
  return win;
}

describe("widget entry", () => {
  it("loads without throwing outside a browser", async () => {
    await expect(import("./index")).resolves.toBeDefined();
  });

  it("releases the init guard after a failed boot, so a corrected snippet can start", async () => {
    const win = stubPage("not-a-key");
    await import("./index");
    await vi.waitFor(() => expect(win.__askwellWidget).toBe(false));
  });

  it("keeps the guard while a start is in progress (no duplicate starts)", async () => {
    const win = stubPage("pk_abc");
    win.fetch = () => new Promise(() => {}); // never settles
    await import("./index");
    expect(win.__askwellWidget).toBe(true);
  });
});
