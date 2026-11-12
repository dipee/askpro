import Link from "next/link";
import { cn } from "../ui/cn";

export const PROJECT_TABS = [
  { slug: "install", label: "Install" },
  { slug: "knowledge", label: "Knowledge" },
  { slug: "conversations", label: "Conversations" },
  { slug: "customize", label: "Customize" },
] as const;

/** The project tabs as links. Pure (pathname passed in) so it can be tested. */
export function ProjectTabLinks({ projectId, pathname }: { projectId: string; pathname: string }) {
  return (
    <nav aria-label="Project" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1 border-b border-border">
        {PROJECT_TABS.map(({ slug, label }) => {
          const href = `/dashboard/projects/${projectId}/${slug}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={slug}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium transition-colors",
                  active
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
