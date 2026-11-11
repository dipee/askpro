import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["apps/web", "apps/widget", "packages/db", "packages/shared"],
  },
});
