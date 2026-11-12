import type { ComponentProps } from "react";
import { cn } from "./cn";

/** Small circular loading indicator. */
export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center", className)}>
      <span
        aria-hidden="true"
        className="size-5 animate-spin rounded-full border-2 border-border border-t-foreground"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Grey placeholder block for loading layouts. Size it with className. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-skeleton", className)}
      {...props}
    />
  );
}
