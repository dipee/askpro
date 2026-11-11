import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";

// Placeholder so the sign-in redirect can be tested. B2 replaces it.
export default async function DashboardPage() {
  await auth.protect();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <UserButton />
    </main>
  );
}
