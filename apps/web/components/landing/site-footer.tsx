import Link from "next/link";
import { APP_NAME } from "@askwell/shared";

export function SiteFooter() {
  return (
    <footer className="border-t border-glass-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          <span className="font-semibold text-foreground">{APP_NAME}</span> · AI support chat for any website
        </p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
          <Link href="/sign-in" className="hover:text-foreground">Sign in</Link>
          <Link href="/sign-up" className="hover:text-foreground">Start free</Link>
        </nav>
        <p>© {new Date().getFullYear()} {APP_NAME}</p>
      </div>
    </footer>
  );
}
