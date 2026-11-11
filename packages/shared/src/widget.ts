import { z } from "zod";

/** Matches `widget_configs.position`. */
export const WIDGET_POSITIONS = ["bottom-right", "bottom-left", "top-right", "top-left"] as const;
export type WidgetPosition = (typeof WIDGET_POSITIONS)[number];
export const widgetPositionSchema = z.enum(WIDGET_POSITIONS);

/** Matches `widget_configs.animation`. */
export const WIDGET_ANIMATIONS = ["fade", "slide", "scale"] as const;
export type WidgetAnimation = (typeof WIDGET_ANIMATIONS)[number];
export const widgetAnimationSchema = z.enum(WIDGET_ANIMATIONS);

export const MAX_WIDGET_LABEL_CHARS = 30;
export const MAX_WIDGET_HEADER_CHARS = 60;

/** `#rrggbb` */
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #1a2b3c");

export const widgetConfigSchema = z.object({
  buttonColor: hexColorSchema,
  position: widgetPositionSchema,
  label: z.string().trim().min(1).max(MAX_WIDGET_LABEL_CHARS),
  animation: widgetAnimationSchema,
  headerText: z.string().trim().min(1).max(MAX_WIDGET_HEADER_CHARS),
  showBadge: z.boolean(),
});

/** One project's widget settings (`widget_configs`, camelCase). */
export type WidgetConfig = z.infer<typeof widgetConfigSchema>;

/** Free defaults. New projects start with these; Free always gets them. */
export const DEFAULT_WIDGET_CONFIG = {
  buttonColor: "#000000",
  position: "bottom-right",
  label: "Chat",
  animation: "fade",
  headerText: "How can we help?",
  showBadge: true,
} as const satisfies WidgetConfig;
