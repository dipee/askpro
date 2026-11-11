"use client";

import { usePathname } from "next/navigation";
import { NavLinks } from "./nav-links";

/** Desktop sidebar nav; highlights the current section. */
export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Dashboard">
      <NavLinks pathname={pathname} />
    </nav>
  );
}
