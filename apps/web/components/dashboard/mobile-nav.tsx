"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { NavLinks } from "./nav-links";

/** Menu button and drop-down nav for the mobile top bar. */
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex size-10 items-center justify-center rounded-md text-foreground hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open ? (
        <nav
          id="mobile-nav"
          aria-label="Dashboard"
          className="absolute inset-x-0 top-full border-b border-glass-border bg-white/90 p-3 shadow-md backdrop-blur-glass"
        >
          <NavLinks pathname={pathname} onNavigate={close} />
        </nav>
      ) : null}
    </>
  );
}
