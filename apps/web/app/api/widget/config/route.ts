import { DEFAULT_WIDGET_CONFIG, planSchema, widgetConfigQuerySchema, type WidgetConfigResponse } from "@askwell/shared";
import type { NextRequest } from "next/server";
import { publicCorsHeaders, publicPreflight } from "../../../../lib/api/cors";
import { errorResponse } from "../../../../lib/api/errors";
import { createServiceClient } from "../../../../lib/supabase/service";
import { applyPlanToConfig, widgetConfigFromRow } from "../../../../lib/widget-config";

// Public: the widget loader and panel call this from any origin (project.md §8).
// TODO(Phase 3): Arcjet fixed-window rate limit per route + public key + IP (project.md §3).

const CORS = publicCorsHeaders(["GET"]);

export function OPTIONS(): Response {
  return publicPreflight(["GET"]);
}

export async function GET(request: NextRequest): Promise<Response> {
  const query = widgetConfigQuerySchema.safeParse({ key: request.nextUrl.searchParams.get("key") ?? "" });
  if (!query.success) {
    return errorResponse("validation", "Invalid widget key.", { ...CORS, "Cache-Control": "no-store" });
  }

  // Service client: visitors have no Supabase key. The project is resolved by its
  // public key only, and only the config and the owner's plan are read.
  const { data, error } = await createServiceClient()
    .from("projects")
    .select(
      "accounts(plan), widget_configs(button_color, position, label, animation, header_text, show_badge)",
    )
    .eq("public_key", query.data.key)
    .maybeSingle();

  if (error) {
    console.error("widget config: reading the project failed", error.message);
    return errorResponse("internal", "Something went wrong.", { ...CORS, "Cache-Control": "no-store" });
  }
  if (!data) {
    return errorResponse("not_found", "Unknown widget key.", { ...CORS, "Cache-Control": "no-store" });
  }

  // The plan is read on the server, never taken from the request (project.md §5).
  const plan = planSchema.catch("free").parse(data.accounts?.plan);
  const stored = data.widget_configs ? widgetConfigFromRow(data.widget_configs) : DEFAULT_WIDGET_CONFIG;
  const body: WidgetConfigResponse = { config: applyPlanToConfig(plan, stored) };

  return Response.json(body, {
    headers: { ...CORS, "Cache-Control": "public, max-age=60" },
  });
}
