// Wraps this segment's tab pages only. The layout (which runs the ownership check and
// notFound()) renders before this boundary, so an unknown project is a real 404.
import { GlassPanel } from "../../../../components/ui/glass-panel";
import { Skeleton, Spinner } from "../../../../components/ui/spinner";

export default function ProjectLoading() {
  return (
    <div aria-busy="true">
      <Skeleton className="mb-3 h-4 w-20" />
      <Skeleton className="mb-4 h-8 w-56 max-w-full" />
      <Skeleton className="h-10 w-full" />
      <GlassPanel className="mt-6 flex flex-col items-center gap-4 px-6 py-12">
        <Spinner label="Loading project" />
        <Skeleton className="h-4 w-48 max-w-full" />
      </GlassPanel>
    </div>
  );
}
