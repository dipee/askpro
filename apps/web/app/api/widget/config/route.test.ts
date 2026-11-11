import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = { data: unknown; error: { message: string } | null };

// A chainable stand-in for supabase-js: from().select().eq().maybeSingle().
const db = vi.hoisted(() => {
  const state = { result: { data: null, error: null } as QueryResult, calls: [] as unknown[][] };
  const builder = {
    from: (...a: unknown[]) => (state.calls.push(["from", ...a]), builder),
    select: (...a: unknown[]) => (state.calls.push(["select", ...a]), builder),
    eq: (...a: unknown[]) => (state.calls.push(["eq", ...a]), builder),
    maybeSingle: async () => state.result,
  };
  return { state, builder };
});

vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/supabase/service", () => ({ createServiceClient: () => db.builder }));

const { GET, OPTIONS } = await import("./route");

const KEY = "pk_0123456789abcdef0123456789abcdef";
const STORED = {
  button_color: "#ff0066",
  position: "top-left",
  label: "Ask us",
  animation: "slide",
  header_text: "Hi there!",
  show_badge: false,
};

function get(query: string) {
  return GET(new NextRequest(`https://askwell.test/api/widget/config${query}`));
}

function expectCors(res: Response) {
  expect(res.headers.get("access-control-allow-origin")).toBe("*");
  expect(res.headers.get("access-control-allow-credentials")).toBeNull();
}

beforeEach(() => {
  db.state.calls = [];
  db.state.result = { data: null, error: null };
});

describe("GET /api/widget/config", () => {
  it("200: Pro gets its stored config, and nothing but the config", async () => {
    db.state.result = { data: { accounts: { plan: "pro" }, widget_configs: STORED }, error: null };
    const res = await get(`?key=${KEY}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      config: {
        buttonColor: "#ff0066",
        position: "top-left",
        label: "Ask us",
        animation: "slide",
        headerText: "Hi there!",
        showBadge: false,
      },
    });
    expectCors(res);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it("200: Free gets the defaults with the badge, whatever is stored", async () => {
    db.state.result = { data: { accounts: { plan: "free" }, widget_configs: STORED }, error: null };
    const res = await get(`?key=${KEY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ config: DEFAULT_WIDGET_CONFIG });
  });

  it("looks the project up by public_key only, reading just the plan and config columns", async () => {
    db.state.result = { data: { accounts: { plan: "free" }, widget_configs: STORED }, error: null };
    await get(`?key=${KEY}`);
    expect(db.state.calls).toContainEqual(["from", "projects"]);
    expect(db.state.calls).toContainEqual(["eq", "public_key", KEY]);
    const select = db.state.calls.find((c) => c[0] === "select")?.[1] as string;
    expect(select).not.toMatch(/\bname\b|owner_id|\bid\b|messages_used|public_key/);
  });

  it("an unknown plan value falls back to Free", async () => {
    db.state.result = { data: { accounts: { plan: "enterprise" }, widget_configs: STORED }, error: null };
    expect(await (await get(`?key=${KEY}`)).json()).toEqual({ config: DEFAULT_WIDGET_CONFIG });
  });

  it.each([
    ["no key", ""],
    ["an empty key", "?key="],
    ["a key without pk_", "?key=abc123"],
    ["a key with bad characters", "?key=pk_<script>"],
    ["a key that is too long", `?key=pk_${"a".repeat(65)}`],
  ])("400 for %s, without querying the database", async (_, query) => {
    const res = await get(query);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "validation", message: "Invalid widget key." } });
    expectCors(res);
    expect(db.state.calls).toEqual([]);
  });

  it("404 for an unknown key", async () => {
    const res = await get(`?key=${KEY}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "Unknown widget key." } });
    expectCors(res);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("500 without leaking the database error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.state.result = { data: null, error: { message: "relation projects does not exist" } };
    const res = await get(`?key=${KEY}`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "internal", message: "Something went wrong." } });
  });
});

describe("OPTIONS /api/widget/config", () => {
  it("answers the CORS preflight for any origin", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expectCors(res);
    expect(res.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
  });
});
