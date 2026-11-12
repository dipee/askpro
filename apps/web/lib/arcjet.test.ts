import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Plain records, not mock call history: the client is built once, on the first
// protectChat call, and mock history doesn't survive between tests.
const built = vi.hoisted(() => ({ clients: [] as unknown[], rateLimits: [] as unknown[], injection: [] as unknown[] }));
const protect = vi.hoisted(() => vi.fn());
const arcjet = vi.hoisted(() => (options: unknown) => (built.clients.push(options), { protect }));
const fixedWindow = vi.hoisted(() => (options: unknown) => (built.rateLimits.push(options), [{ type: "RATE_LIMIT" }]));
const detectPromptInjection = vi.hoisted(() => (options: unknown) => (built.injection.push(options), [{ type: "PROMPT_INJECTION" }]));

vi.mock("server-only", () => ({}));
vi.mock("@arcjet/next", () => ({ default: arcjet, fixedWindow, detectPromptInjection }));

const { protectChat, CHAT_RATE_LIMIT } = await import("./arcjet");

type Kind = "allow" | "rate_limit" | "injection" | "error";
function decision(kind: Kind) {
  return {
    isErrored: () => kind === "error",
    isDenied: () => kind === "rate_limit" || kind === "injection",
    reason: { isRateLimit: () => kind === "rate_limit", isPromptInjection: () => kind === "injection", message: "boom" },
  };
}

const req = new Request("https://app.test/api/widget/chat", { method: "POST" });
const input = { publicKey: "pk_abc", message: "Do you fix taps?" };

beforeEach(() => {
  protect.mockReset();
  vi.stubEnv("ARCJET_KEY", "ajkey_test");
});
afterEach(() => vi.unstubAllEnvs());

describe("protectChat", () => {
  it("allows an allowed request and passes the key and message to Arcjet", async () => {
    protect.mockResolvedValue(decision("allow"));
    await expect(protectChat(req, input)).resolves.toEqual({ ok: true });
    expect(protect).toHaveBeenCalledExactlyOnceWith(req, {
      publicKey: "pk_abc",
      detectPromptInjectionMessage: "Do you fix taps?",
    });
  });

  it("maps a rate-limit deny to rate_limit", async () => {
    protect.mockResolvedValue(decision("rate_limit"));
    await expect(protectChat(req, input)).resolves.toEqual({ ok: false, reason: "rate_limit" });
  });

  it("maps a prompt-injection deny to injection", async () => {
    protect.mockResolvedValue(decision("injection"));
    await expect(protectChat(req, input)).resolves.toEqual({ ok: false, reason: "injection" });
  });

  it("fails open on an errored decision", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    protect.mockResolvedValue(decision("error"));
    await expect(protectChat(req, input)).resolves.toEqual({ ok: true });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("fails open when Arcjet throws (network error, timeout)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    protect.mockRejectedValue(new Error("fetch failed"));
    await expect(protectChat(req, input)).resolves.toEqual({ ok: true });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("builds one client: LIVE 20/min fixed window per route + publicKey + IP, LIVE injection check", async () => {
    // Call it here so the test doesn't rely on an earlier test having built the client.
    protect.mockResolvedValue(decision("allow"));
    await protectChat(req, input);
    await protectChat(req, input);
    expect(built.clients).toHaveLength(1);
    expect(built.clients[0]).toMatchObject({ key: "ajkey_test" });
    expect(built.rateLimits).toEqual([
      {
        mode: "LIVE",
        characteristics: ["http.request.uri.path", "publicKey", "ip.src"],
        window: 60,
        max: CHAT_RATE_LIMIT,
      },
    ]);
    expect(CHAT_RATE_LIMIT).toBe(20);
    expect(built.injection).toEqual([{ mode: "LIVE" }]);
  });

  it("is server-only", async () => {
    const source = await readFile(fileURLToPath(new URL("./arcjet.ts", import.meta.url)), "utf8");
    expect(source.split("\n")[0]).toBe('import "server-only";');
  });
});
