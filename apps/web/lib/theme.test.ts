import { afterEach, describe, expect, it, vi } from "vitest";
import {
  THEME_CHANGE_EVENT,
  THEME_CHOICES,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  parseThemeChoice,
  readThemeChoice,
  resolveTheme,
  writeThemeChoice,
} from "./theme";

describe("resolveTheme", () => {
  it.each([
    ["system", false, "light"],
    ["system", true, "dark"],
    ["light", false, "light"],
    ["light", true, "light"],
    ["dark", false, "dark"],
    ["dark", true, "dark"],
  ] as const)("%s with OS dark=%s → %s", (choice, systemDark, expected) => {
    expect(resolveTheme(choice, systemDark)).toBe(expected);
  });
});

describe("parseThemeChoice", () => {
  it("keeps a known choice", () => {
    for (const choice of THEME_CHOICES) expect(parseThemeChoice(choice)).toBe(choice);
  });
  it.each([null, undefined, "", "Dark", "blue", 1])("defaults %j to system", (value) => {
    expect(parseThemeChoice(value)).toBe("system");
  });
});

/** A fake browser: localStorage, matchMedia, <html> and events. */
function fakeWindow({ stored = null as string | null, systemDark = false, storageThrows = false } = {}) {
  const store = new Map<string, string>(stored === null ? [] : [[THEME_STORAGE_KEY, stored]]);
  const attrs: Record<string, string> = {};
  const html = {
    dataset: attrs,
    setAttribute: (name: string, value: string) => {
      attrs[name.replace(/^data-/, "")] = value;
    },
  };
  const guard = () => {
    if (storageThrows) throw new Error("SecurityError");
  };
  const localStorage = {
    getItem: (k: string) => (guard(), store.get(k) ?? null),
    setItem: (k: string, v: string) => (guard(), void store.set(k, v)),
    removeItem: (k: string) => (guard(), void store.delete(k)),
  };
  const events: Event[] = [];
  const win = {
    localStorage,
    matchMedia: (q: string) => ({ matches: q === "(prefers-color-scheme: dark)" && systemDark }),
    dispatchEvent: (e: Event) => (events.push(e), true),
  };
  return { win, html, attrs, store, events, localStorage };
}

describe("THEME_INIT_SCRIPT (runs before paint)", () => {
  function run(f: ReturnType<typeof fakeWindow>) {
    new Function("window", "localStorage", "document", THEME_INIT_SCRIPT)(f.win, f.localStorage, {
      documentElement: f.html,
    });
    return f.attrs.theme;
  }

  it.each(
    [null, "system", "light", "dark", "junk"].flatMap((stored) =>
      [false, true].map((systemDark) => [stored, systemDark] as const),
    ),
  )("stored %j, OS dark=%s: same result as resolveTheme", (stored, systemDark) => {
    expect(run(fakeWindow({ stored, systemDark }))).toBe(resolveTheme(parseThemeChoice(stored), systemDark));
  });

  it("follows the OS when storage throws", () => {
    expect(run(fakeWindow({ storageThrows: true, systemDark: true }))).toBe("dark");
  });

  it("never throws, even without matchMedia", () => {
    const f = fakeWindow();
    const win = { localStorage: f.localStorage };
    expect(() =>
      new Function("window", "localStorage", "document", THEME_INIT_SCRIPT)(win, f.localStorage, {
        documentElement: f.html,
      }),
    ).not.toThrow();
    expect(f.attrs.theme).toBeUndefined(); // no attribute → light tokens
  });
});

describe("readThemeChoice / writeThemeChoice", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(f: ReturnType<typeof fakeWindow>) {
    vi.stubGlobal("window", f.win);
    vi.stubGlobal("document", { documentElement: f.html });
    vi.stubGlobal(
      "CustomEvent",
      class extends Event {
        detail: unknown;
        constructor(type: string, init?: { detail?: unknown }) {
          super(type);
          this.detail = init?.detail;
        }
      },
    );
  }

  it("defaults to system when nothing is stored", () => {
    stub(fakeWindow());
    expect(readThemeChoice()).toBe("system");
  });

  it("stores the choice, applies it to <html> and tells the tab", () => {
    const f = fakeWindow({ systemDark: false });
    stub(f);
    writeThemeChoice("dark");
    expect(f.store.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(f.attrs.theme).toBe("dark");
    expect(readThemeChoice()).toBe("dark");
    expect(f.events.map((e) => e.type)).toEqual([THEME_CHANGE_EVENT]);

    writeThemeChoice("system");
    expect(f.store.has(THEME_STORAGE_KEY)).toBe(false);
    expect(f.attrs.theme).toBe("light");
  });

  it("still applies the choice when storage throws, and reads back system", () => {
    const f = fakeWindow({ storageThrows: true });
    stub(f);
    expect(() => writeThemeChoice("dark")).not.toThrow();
    expect(f.attrs.theme).toBe("dark");
    expect(readThemeChoice()).toBe("system");
  });
});
