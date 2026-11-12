import { usageLabel, type Usage } from "../../lib/usage";
import { cn } from "../ui/cn";

/**
 * "N / LIMIT messages this month" with a bar. At 90% or more, a hint that the widget
 * will (or now does) show visitors the quota message.
 */
export function UsageMeter({ usage, className }: { usage: Usage; className?: string }) {
  const label = usageLabel(usage);
  const percent = Math.round(usage.ratio * 100);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <p className="text-sm">{label}</p>
      <div
        role="meter"
        aria-label="Messages this month"
        aria-valuemin={0}
        aria-valuemax={usage.limit}
        aria-valuenow={Math.min(usage.used, usage.limit)}
        aria-valuetext={label}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full", usage.nearLimit ? "bg-foreground" : "bg-muted-foreground")}
          style={{ width: `${percent}%` }}
        />
      </div>
      {usage.atLimit ? (
        <p className="text-xs text-foreground">
          Limit reached. The widget shows visitors a message-limit notice until next month.
        </p>
      ) : usage.nearLimit ? (
        <p className="text-xs text-muted-foreground">
          Almost at the limit. When it&apos;s reached, the widget shows visitors a message-limit notice.
        </p>
      ) : null}
    </div>
  );
}
