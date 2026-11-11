import "server-only";
import type { Database } from "@askwell/db";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { required, supabaseUrl } from "./env";

/**
 * Supabase client that acts as the signed-in owner. Each request carries the owner's
 * Clerk session token (Clerk is a Supabase third-party auth provider, no JWT template),
 * so RLS scopes every read to their own rows. Use it for all owner reads.
 *
 * Server only: call it in a Route Handler, Server Component or Server Function after
 * `auth.protect()`. Without a session the token is null and requests run as `anon`,
 * which can read nothing.
 */
export function createOwnerClient() {
  return createClient<Database>(
    supabaseUrl(),
    required(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      accessToken: async () => (await auth()).getToken(),
    },
  );
}
