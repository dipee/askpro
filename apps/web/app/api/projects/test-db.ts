// Test helper: a chainable, awaitable stand-in for supabase-js query builders.
import { vi } from "vitest";

export type Result = { data: unknown; error: { message: string; code?: string } | null };

export function fakeClient(name: string) {
  const state = { results: [] as Result[], calls: [] as unknown[][] };
  const next = () => state.results.shift() ?? { data: null, error: null };
  const builder: Record<string, unknown> = {
    then: (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(next()).then(resolve, reject),
    maybeSingle: async () => next(),
    rpc: (...a: unknown[]) => {
      state.calls.push(["rpc", ...a]);
      return Promise.resolve(next());
    },
  };
  for (const m of ["from", "select", "insert", "update", "delete", "eq", "order"]) {
    builder[m] = (...a: unknown[]) => (state.calls.push([m, ...a]), builder);
  }
  const create = vi.fn(() => builder);
  return { name, state, create };
}
