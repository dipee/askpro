import { GlassPanel } from "@/components/ui/glass-panel";
import { Skeleton, Spinner } from "@/components/ui/spinner";

// Billing's own loading state. It wraps only this page; a loading.tsx at /dashboard
// would also wrap /dashboard/projects/[id] and make its not-found a 200 (P2P-T09).
export default function BillingLoading() {
  return (
    <div aria-busy="true">
      <div className="mb-6 flex flex-col gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-48 max-w-full" />
      </div>
      <GlassPanel className="flex flex-col items-center gap-4 px-6 py-12">
        <Spinner label="Loading billing" />
        <Skeleton className="h-4 w-48 max-w-full" />
      </GlassPanel>
    </div>
  );
}
