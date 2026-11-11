import {
  DEFAULT_WIDGET_CONFIG,
  PLAN_LIMITS,
  widgetConfigSchema,
  type Plan,
  type WidgetConfig,
} from "@askwell/shared";
import type { WidgetConfigRow } from "@askwell/db";

/** A `widget_configs` row (snake_case) as the shared `WidgetConfig`. */
export function widgetConfigFromRow(row: Omit<WidgetConfigRow, "project_id">): WidgetConfig {
  return widgetConfigSchema.parse({
    buttonColor: row.button_color,
    position: row.position,
    label: row.label,
    animation: row.animation,
    headerText: row.header_text,
    showBadge: row.show_badge,
  });
}

/**
 * The config a visitor gets: each stored setting is used only if the owner's plan
 * allows it (PLAN_LIMITS), else the default. Free therefore always gets
 * DEFAULT_WIDGET_CONFIG with the badge shown, whatever is stored.
 */
export function applyPlanToConfig(plan: Plan, stored: WidgetConfig): WidgetConfig {
  const limits = PLAN_LIMITS[plan];
  const d = DEFAULT_WIDGET_CONFIG;
  const animations: readonly string[] = limits.animations;
  return {
    buttonColor: limits.customColor ? stored.buttonColor : d.buttonColor,
    position: limits.anyPosition ? stored.position : d.position,
    label: limits.customLabel ? stored.label : d.label,
    animation: animations.includes(stored.animation) ? stored.animation : d.animation,
    headerText: limits.customHeader ? stored.headerText : d.headerText,
    showBadge: limits.canHideBadge ? stored.showBadge : true,
  };
}
