import Link from "next/link";
import { APP_NAME } from "@askwell/shared";

/** Top bar: name, anchor links (hidden on small screens), sign in and Start free. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-glass-border bg-black/60 backdrop-blur-glass">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {APP_NAME}
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#how-it-works" className="hover:text-foreground">How it works</a>
          <a href="#demo" className="hover:text-foreground">Demo</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
          <a href="#install" className="hover:text-foreground">Install</a>
        </nav>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/sign-in" className="text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex h-9 items-center rounded-full bg-primary px-4 font-medium text-primary-foreground hover:bg-gray-200"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}
