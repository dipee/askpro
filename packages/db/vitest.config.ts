import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "db",
    include: ["tests/**/*.test.ts"],
    // Each file boots its own pglite (hundreds of MB of WASM memory); one at a time
    // keeps small CI and sandbox machines from running out of memory.
    fileParallelism: false,
    // Booting pglite and running the migrations takes a few seconds.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
