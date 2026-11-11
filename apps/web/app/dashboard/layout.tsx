import type { ReactNode } from "react";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { APP_NAME } from "@askwell/shared";
import { ensureAccount } from "@/lib/accounts";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { ErrorState } from "@/components/ui/error-state";
import { GlassPanel } from "@/components/ui/glass-panel";

/** Makes sure the signed-in owner has an `accounts` row. False if that failed. */
async function accountReady(): Promise<boolean> {
  try {
    await ensureAccount();
    return true;
  } catch (error) {
    console.error("ensureAccount failed", error);
    return false;
  }
}

// Light, monochrome glass shell (project.md §13). Sidebar on desktop, top bar
// with a menu below md (works at 375 px).
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await auth.protect();
  const ready = await accountReady();

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-gray-50">
      {/* Soft monochrome shapes behind the glass so the blur reads. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-0">
        <div className="absolute -left-24 -top-24 size-96 rounded-full bg-gray-300/50 blur-3xl" />
        <div className="absolute -bottom-32 right-0 size-[28rem] rounded-full bg-gray-200/70 blur-3xl" />
      </div>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-glass-border bg-glass px-4 backdrop-blur-glass md:hidden">
        <div className="flex items-center gap-2">
          <MobileNav />
          <span className="text-base font-semibold tracking-tight">{APP_NAME}</span>
        </div>
        <UserButton />
      </header>

      <GlassPanel className="fixed inset-y-4 left-4 z-10 hidden w-60 flex-col p-4 md:flex">
        <span className="px-3 py-2 text-lg font-semibold tracking-tight">{APP_NAME}</span>
        <div className="mt-6 flex-1">
          <SidebarNav />
        </div>
        <div className="flex items-center gap-3 border-t border-glass-border px-3 pt-4">
          <UserButton />
          <span className="text-sm text-muted-foreground">Account</span>
        </div>
      </GlassPanel>

      <main className="relative z-0 mx-auto w-full max-w-5xl px-4 py-6 md:py-10 md:pl-72 md:pr-8">
        {ready ? (
          children
        ) : (
          <ErrorState
            title="We couldn't load your account"
            description="Something went wrong setting up your account. Reload the page to try again."
            action={
              <a
                href="/dashboard"
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-gray-800"
              >
                Reload
              </a>
            }
          />
        )}
      </main>
    </div>
  );
}
