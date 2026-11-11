import "server-only";
import type { Database } from "@askwell/db";
import { createClient } from "@supabase/supabase-js";
import { required, supabaseUrl } from "./env";

/**
 * Supabase client with the secret key: `service_role`, bypasses RLS.
 *
 * Use it only after the route has checked ownership and plan (project.md §9): visitor
 * routes, the Clerk webhook, knowledge processing, Storage, and writes owners can't
 * make. Never for owner reads with a manual owner filter; use `createOwnerClient()`.
 *
 * This is the only file that reads SUPABASE_SECRET_KEY (a test enforces it).
 */
export function createServiceClient() {
  return createClient<Database>(
    supabaseUrl(),
    required(process.env.SUPABASE_SECRET_KEY, "SUPABASE_SECRET_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
}
