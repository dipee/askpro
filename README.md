# Askwell

AI support chat widget for any website. See `docs/project.md` for what we build and `docs/plan.md` for the build order.

## Requirements

- Node 24 (`.nvmrc`)
- pnpm 10 (pinned in `package.json` → `packageManager`; `corepack enable` picks it up)

## Run locally

```sh
pnpm install
pnpm dev
```

Then open http://localhost:3000.

## Layout

```
apps/
  web/        Next.js app (App Router, TypeScript, Tailwind)
  widget/     vanilla TS loader, bundled by esbuild to dist/widget.js
packages/
  shared/     the contract: APP_NAME, API types, zod schemas
  db/         generated Supabase types (types.ts)
supabase/
  migrations/ SQL migrations
```

## Commands

| Command | Does |
|---|---|
| `pnpm install` | Install every workspace |
| `pnpm dev` | Run the app (http://localhost:3000) and rebuild the widget on change |
| `pnpm typecheck` | `tsc --noEmit` in every workspace |
| `pnpm lint` | ESLint across the repo (Next config for `apps/web`, TypeScript config elsewhere) |
| `pnpm test` | Vitest across all projects |
| `pnpm build` | Build the widget (`apps/widget/dist/widget.js`) and the Next app |
| `pnpm db:types` | Regenerate `packages/db/types.ts` (needs `SUPABASE_PROJECT_ID` and a Supabase login) |

## Environment

Copy `.env.example` to `apps/web/.env.local` and fill in the values for the current phase. Never commit `.env` files.

## Vercel

The Vercel project uses **Root Directory `apps/web`**. Vercel detects pnpm from the root lockfile and installs the whole workspace.
