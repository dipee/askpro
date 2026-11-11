/** Dashboard navigation. Per-project pages arrive in Phase 2 under /dashboard/projects/[id]. */
export type NavItem = { href: string; label: string };

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Projects" },
  { href: "/dashboard/billing", label: "Billing" },
];

function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * True when `href` is the current section. "Projects" also covers
 * /dashboard/projects/…; other items match their path and anything under it.
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || under(pathname, "/dashboard/projects");
  }
  return under(pathname, href);
}
