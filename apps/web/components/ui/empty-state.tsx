import type { ReactNode } from "react";
import { GlassPanel } from "./glass-panel";

type EmptyStateProps = {
  title: string;
  description?: string;
  /** Optional icon shown above the title. */
  icon?: ReactNode;
  /** Optional call to action, e.g. a Button. */
  action?: ReactNode;
};

/** Centered placeholder for a screen or list with nothing in it yet. */
export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <GlassPanel className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon ? (
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-foreground">
          {icon}
        </div>
      ) : null}
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </GlassPanel>
  );
}
