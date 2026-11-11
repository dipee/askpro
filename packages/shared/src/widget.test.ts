import { describe, expect, it } from "vitest";
import { PLAN_LIMITS } from "./plans";
import { DEFAULT_WIDGET_CONFIG, hexColorSchema, widgetConfigSchema } from "./widget";

describe("hexColorSchema", () => {
  it("accepts #rrggbb", () => expect(hexColorSchema.safeParse("#1A2b3c").success).toBe(true));
  it.each(["#fff", "1a2b3c", "#1a2b3g", "red"])("rejects %s", (c) =>
    expect(hexColorSchema.safeParse(c).success).toBe(false),
  );
});

describe("widgetConfigSchema", () => {
  it("accepts the defaults", () =>
    expect(widgetConfigSchema.safeParse(DEFAULT_WIDGET_CONFIG).success).toBe(true));
  it("rejects an unknown position", () =>
    expect(widgetConfigSchema.safeParse({ ...DEFAULT_WIDGET_CONFIG, position: "middle" }).success).toBe(
      false,
    ));
});

describe("DEFAULT_WIDGET_CONFIG", () => {
  it("is allowed on Free", () => {
    expect(DEFAULT_WIDGET_CONFIG.position).toBe("bottom-right");
    expect(PLAN_LIMITS.free.animations).toContain(DEFAULT_WIDGET_CONFIG.animation);
    expect(DEFAULT_WIDGET_CONFIG.showBadge).toBe(true);
  });
});
