import type { ComponentProps } from "react";
import { cn } from "./cn";

/** Glass surface from the design tokens: translucent, blurred, hairline border. */
export const glassClasses =
  "rounded-xl border border-glass-border bg-glass shadow-glass backdrop-blur-glass";

/** A blurred, translucent panel (project.md §13). */
export function GlassPanel({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn(glassClasses, className)} {...props} />;
}
