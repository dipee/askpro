import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { describe, expect, it } from "vitest";
import { css, embedUrl, textColorFor } from "./ui";

describe("embedUrl", () => {
  it("points at /embed with the encoded key and host origin", () => {
    expect(embedUrl("https://app.test", "pk_abc", "https://shop.example.com")).toBe(
      "https://app.test/embed?key=pk_abc&origin=https%3A%2F%2Fshop.example.com",
    );
  });
});

describe("textColorFor", () => {
  it("picks the higher WCAG contrast (black on #ff00ff, not white)", () => {
    expect(textColorFor("#ff00ff")).toBe("#000"); // 6.70 vs 3.14
    expect(textColorFor("#767676")).toBe("#000"); // 4.62 vs 4.54
    expect(textColorFor("#757575")).toBe("#fff"); // 4.56 vs 4.61
  });

  it("picks readable text", () => {
    expect(textColorFor("#000000")).toBe("#fff");
    expect(textColorFor("#ffffff")).toBe("#000");
    expect(textColorFor("#ffd400")).toBe("#000");
    expect(textColorFor("#1d4ed8")).toBe("#fff");
  });
});

describe("css", () => {
  it.each([
    ["bottom-right", "bottom:20px;right:20px"],
    ["bottom-left", "bottom:20px;left:20px"],
    ["top-right", "top:20px;right:20px"],
    ["top-left", "top:20px;left:20px"],
  ] as const)("puts the button in %s", (position, expected) => {
    expect(css({ ...DEFAULT_WIDGET_CONFIG, position })).toContain(`.b{position:fixed;${expected}`);
  });

  it("uses the configured color and isolates from the host", () => {
    const out = css({ ...DEFAULT_WIDGET_CONFIG, buttonColor: "#ff0066" });
    expect(out).toContain("background:#ff0066");
    expect(out.startsWith(":host{all:initial}")).toBe(true);
  });

  it.each([
    ["fade", "transform:none;visibility:hidden"],
    ["slide", "transform:translateY(16px)"],
    ["scale", "transform:scale(.9)"],
  ] as const)("hidden state for the %s animation", (animation, expected) => {
    expect(css({ ...DEFAULT_WIDGET_CONFIG, animation })).toContain(expected);
  });

  it("goes full screen on narrow screens and respects reduced motion", () => {
    const out = css(DEFAULT_WIDGET_CONFIG);
    expect(out).toContain("@media (max-width:480px){.p{inset:0;width:100%;height:100%");
    expect(out).toContain("@media (prefers-reduced-motion:reduce)");
  });
});
