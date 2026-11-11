import type { ReactNode } from "react";
import { GlassPanel } from "./glass-panel";

type ErrorStateProps = {
  title?: string;
  description?: string;
  /** Optional recovery action, e.g. a "Try again" Button. */
  action?: ReactNode;
};

/** Shown when a screen fails to load. */
export function ErrorState({
  title = "Something went wrong",
  description = "Please try again. If it keeps happening, reload the page.",
  action,
}: ErrorStateProps) {
  return (
    <GlassPanel role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </GlassPanel>
  );
}
