import js from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const WEB = "apps/web/**/*.{js,mjs,cjs,jsx,ts,tsx}";

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/dist/**",
    "**/next-env.d.ts",
    "**/coverage/**",
    "packages/db/types.ts",
  ]),

  // Next.js app: Next's own config (React, hooks, a11y, Core Web Vitals, TS).
  ...[...nextVitals, ...nextTs].map((config) => ({ ...config, files: [WEB] })),
  {
    files: [WEB],
    settings: { next: { rootDir: "apps/web" } },
  },

  // Everything else: plain TypeScript.
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    ignores: [WEB],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["apps/widget/src/**/*.ts"],
    languageOptions: { globals: { ...globals.browser } },
  },
]);
