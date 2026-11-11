import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Built at runtime so this file doesn't itself reference the secret's name.
const SECRET = ["SUPABASE", "SECRET", "KEY"].join("_");

const createClient = vi.hoisted(() => vi.fn(() => ({})));
const getToken = vi.hoisted(() => vi.fn(async () => "clerk-session-token"));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ getToken }) }));

const { createOwnerClient } = await import("./owner");
const { createServiceClient } = await import("./service");

const URL_ = "https://project.supabase.co";

beforeEach(() => {
  createClient.mockClear();
  getToken.mockClear();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv(SECRET, "sb_secret_test");
});
afterEach(() => vi.unstubAllEnvs());

describe("createOwnerClient", () => {
  it("uses the publishable key and the owner's Clerk session token", async () => {
    createOwnerClient();
    expect(createClient).toHaveBeenCalledOnce();
    const [url, key, options] = createClient.mock.calls[0] as unknown as [
      string,
      string,
      { accessToken: () => Promise<string | null> },
    ];
    expect(url).toBe(URL_);
    expect(key).toBe("sb_publishable_test");
    expect(await options.accessToken()).toBe("clerk-session-token");
    expect(getToken).toHaveBeenCalledWith();
  });

  it("never uses the secret key", () => {
    createOwnerClient();
    expect(JSON.stringify(createClient.mock.calls)).not.toContain("sb_secret_test");
  });

  it("fails clearly without the publishable key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(() => createOwnerClient()).toThrow("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });
});

describe("createServiceClient", () => {
  it("uses the secret key and no session persistence", () => {
    createServiceClient();
    expect(createClient).toHaveBeenCalledWith(URL_, "sb_secret_test", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });

  it("fails clearly without the secret key", () => {
    vi.stubEnv(SECRET, "");
    expect(() => createServiceClient()).toThrow(SECRET);
  });

  it("fails clearly without the project URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => createServiceClient()).toThrow("NEXT_PUBLIC_SUPABASE_URL");
  });
});

describe("secret key containment", () => {
  const WEB_ROOT = fileURLToPath(new URL("../../", import.meta.url));
  const SKIP = new Set(["node_modules", ".next", ".turbo", "coverage"]);

  async function sourceFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
      else if (/\.(c|m)?(j|t)sx?$/.test(entry.name)) files.push(path);
    }
    return files;
  }

  it("only lib/supabase/service.ts references the secret key", async () => {
    const files = await sourceFiles(WEB_ROOT);
    expect(files.length).toBeGreaterThan(5);
    const hits: string[] = [];
    for (const file of files) {
      if ((await readFile(file, "utf8")).includes(SECRET)) {
        hits.push(relative(WEB_ROOT, file).split(sep).join("/"));
      }
    }
    expect(hits).toEqual(["lib/supabase/service.ts"]);
  });

  it("service.ts starts with import \"server-only\"", async () => {
    const source = await readFile(join(WEB_ROOT, "lib/supabase/service.ts"), "utf8");
    expect(source.split("\n")[0]).toBe('import "server-only";');
  });
});
