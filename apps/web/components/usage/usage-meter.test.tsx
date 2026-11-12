import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { currentUsage } from "../../lib/usage";
import { UsageMeter } from "./usage-meter";

const NOW = new Date("2026-11-12T12:00:00Z");
const render = (messagesUsed: number) =>
  renderToStaticMarkup(
    <UsageMeter usage={currentUsage({ messagesUsed, periodStart: "2026-11-01T00:00:00Z" }, "free", NOW)} />,
  );

describe("UsageMeter", () => {
  it("shows the label and a bar sized to the share used, with no hint below 90%", () => {
    const html = render(45);
    expect(html).toContain("45 / 100 messages this month");
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuenow="45"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain("width:45%");
    expect(html).not.toContain("limit notice");
  });

  it("warns from 90%", () => {
    expect(render(90)).toContain("Almost at the limit.");
  });

  it("at the limit, says the widget shows the quota message", () => {
    const html = render(100);
    expect(html).toContain("Limit reached.");
    expect(html).toContain("width:100%");
  });

  it("caps the bar at 100% when the count is above the limit", () => {
    const html = render(250);
    expect(html).toContain("250 / 100 messages this month");
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain("width:100%");
  });
});
