import { GlassPanel } from "@/components/ui/glass-panel";
import { Skeleton, Spinner } from "@/components/ui/spinner";

export default function DashboardLoading() {
  return (
    <div aria-busy="true">
      <div className="mb-6 flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <GlassPanel className="flex flex-col items-center gap-4 px-6 py-12">
        <Spinner />
        <Skeleton className="h-4 w-48 max-w-full" />
      </GlassPanel>
    </div>
  );
}
