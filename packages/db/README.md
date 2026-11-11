# @askwell/db

`types.ts` is generated from the Supabase dev project. Do not edit it by hand.

## Testing migrations on pglite

`supabase-pglite.ts` starts an in-memory Postgres (pglite + pgvector), stubs what Supabase provides (the `anon`, `authenticated` and `service_role` roles, the `extensions` schema, `auth.jwt()`, and Supabase's default privileges on `public`), then runs every file in `supabase/migrations` in order. Never test against a local Supabase stack or the dev project.

```ts
// in packages/db/tests/*.test.ts
import { createSupabasePglite } from "../supabase-pglite";

const pg = await createSupabasePglite();
await pg.db.query("insert into public.accounts (clerk_user_id) values ('user_a')"); // superuser
const rows = await pg.as("authenticated", "user_a", (s) => s.query("select * from public.projects"));
await pg.close();
```

`pg.as(role, sub, fn)` runs `fn` in one transaction as `role`, with JWT claims `{ role, sub }`. A failing statement rolls the whole transaction back, so test each refused statement in its own `as` call.

Tests live in `tests/` and run with `pnpm test`. Each test file boots its own database; files run one at a time to keep memory low.
