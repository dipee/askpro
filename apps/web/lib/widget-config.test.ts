import { DEFAULT_WIDGET_CONFIG, PLANS, type WidgetConfig } from "@askwell/shared";
import { describe, expect, it } from "vitest";
import { applyPlanToConfig, widgetConfigFromRow } from "./widget-config";

const CUSTOM: WidgetConfig = {
  buttonColor: "#ff0066",
  position: "top-left",
  label: "Ask us",
  animation: "slide",
  headerText: "Hi there!",
  showBadge: false,
};

describe("applyPlanToConfig", () => {
  it("Free gets DEFAULT_WIDGET_CONFIG with the badge shown, whatever is stored", () => {
    expect(applyPlanToConfig("free", CUSTOM)).toEqual(DEFAULT_WIDGET_CONFIG);
    expect(applyPlanToConfig("free", CUSTOM).showBadge).toBe(true);
  });

  it.each(["fade", "slide", "scale"] as const)("Free ignores a stored %s animation", (animation) => {
    expect(applyPlanToConfig("free", { ...CUSTOM, animation }).animation).toBe("fade");
  });

  it("Pro gets the stored config", () => {
    expect(applyPlanToConfig("pro", CUSTOM)).toEqual(CUSTOM);
  });

  it("Pro can show the badge too", () => {
    expect(applyPlanToConfig("pro", { ...CUSTOM, showBadge: true }).showBadge).toBe(true);
  });

  it.each(PLANS)("%s: an all-default stored config stays the default", (plan) => {
    expect(applyPlanToConfig(plan, DEFAULT_WIDGET_CONFIG)).toEqual(DEFAULT_WIDGET_CONFIG);
  });
});

describe("widgetConfigFromRow", () => {
  it("maps snake_case columns to WidgetConfig", () => {
    expect(
      widgetConfigFromRow({
        button_color: "#ff0066",
        position: "top-left",
        label: "Ask us",
        animation: "slide",
        header_text: "Hi there!",
        show_badge: false,
      }),
    ).toEqual(CUSTOM);
  });

  it("rejects a value outside the shared enums", () => {
    expect(() =>
      widgetConfigFromRow({
        button_color: "#000000",
        position: "middle",
        label: "Chat",
        animation: "fade",
        header_text: "Hi",
        show_badge: true,
      }),
    ).toThrow();
  });
});
