import { z } from "zod";
import { type WidgetConfig, widgetConfigSchema } from "../widget";

// PATCH /api/projects/:id/config (Pro only; Free gets 402)
export const updateWidgetConfigSchema = widgetConfigSchema
  .partial()
  .refine(
    (patch) => Object.values(patch).some((v) => v !== undefined),
    "Change at least one field",
  );
export type UpdateWidgetConfigRequest = z.infer<typeof updateWidgetConfigSchema>;
export interface UpdateWidgetConfigResponse {
  config: WidgetConfig;
}
