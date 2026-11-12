import Link from "next/link";
import { cn } from "../ui/cn";
import { isNavItemActive, NAV_ITEMS } from "./nav-items";

type NavLinksProps = {
  pathname: string;
  /** Called after a link is clicked (the mobile menu closes itself). */
  onNavigate?: () => void;
};

/** The dashboard nav list. Pure: the current path comes in as a prop. */
export function NavLinks({ pathname, onNavigate }: NavLinksProps) {
  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = isNavItemActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-10 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-hover hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
