import { GlassPanel } from "../ui/glass-panel";
import { Skeleton, Spinner } from "../ui/spinner";

/** Loading placeholder shaped like the project cards. */
export function ProjectsSkeleton() {
  return (
    <div aria-busy="true">
      <Spinner label="Loading projects" className="sr-only" />
      <ul className="grid gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <li key={i}>
            <GlassPanel className="flex flex-col gap-4 p-5">
              <Skeleton className="h-5 w-40 max-w-full" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-4 w-48 max-w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-10 w-16" />
                <Skeleton className="h-10 w-20" />
              </div>
            </GlassPanel>
          </li>
        ))}
      </ul>
    </div>
  );
}
