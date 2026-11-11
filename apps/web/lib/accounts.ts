import "server-only";
import { auth } from "@clerk/nextjs/server";
import { planSchema, type Plan } from "@askwell/shared";
import { createOwnerClient } from "./supabase/owner";
import { createServiceClient } from "./supabase/service";

/** The signed-in owner's account row (project.md §7). */
export type Account = {
  clerkUserId: string;
  plan: Plan;
  createdAt: string;
};

/** Thrown when there is no Clerk session. */
export class UnauthorizedError extends Error {
  constructor() {
    super("Sign in required.");
    this.name = "UnauthorizedError";
  }
}

const COLUMNS = "clerk_user_id, plan, created_at";

async function readOwnAccount(): Promise<Account | null> {
  // Owner client: RLS limits this to the caller's own row.
  const { data, error } = await createOwnerClient()
    .from("accounts")
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Reading the account failed: ${error.message}`);
  if (!data) return null;
  return {
    clerkUserId: data.clerk_user_id,
    plan: planSchema.parse(data.plan),
    createdAt: data.created_at,
  };
}

/**
 * Returns the signed-in owner's account, creating it (plan `free`) on first
 * sign-in. The user ID comes only from Clerk's server `auth()`.
 *
 * Safe to call concurrently (two tabs): the insert is `on conflict do nothing`,
 * and the row is re-read afterwards, so a row created in between (e.g. by the
 * Clerk webhook) wins.
 */
export async function ensureAccount(): Promise<Account> {
  const { userId } = await auth();
  if (!userId) throw new UnauthorizedError();

  const existing = await readOwnAccount();
  if (existing) return existing;

  // The service client is used only for this insert, for the user ID auth()
  // just returned. Owners can't insert accounts themselves (RLS).
  const { error } = await createServiceClient()
    .from("accounts")
    .upsert(
      { clerk_user_id: userId, plan: "free" },
      { onConflict: "clerk_user_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(`Creating the account failed: ${error.message}`);

  const created = await readOwnAccount();
  if (!created) throw new Error("Account row not readable after insert.");
  return created;
}
