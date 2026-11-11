import { widgetConfigSchema, type WidgetConfig } from "@askwell/shared";

/**
 * Fetches the plan-applied widget config (same origin). Returns null for any
 * failure: unknown or bad key, server error, network error, bad body. The
 * panel then shows a quiet "Chat unavailable".
 */
export async function loadWidgetConfig(
  key: string,
  fetchFn: typeof fetch = fetch,
): Promise<WidgetConfig | null> {
  try {
    const res = await fetchFn(`/api/widget/config?key=${encodeURIComponent(key)}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (typeof body !== "object" || body === null || !("config" in body)) return null;
    const parsed = widgetConfigSchema.safeParse(body.config);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
