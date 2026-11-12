import { describe, expect, it } from "vitest";
import { formatCreated, planLimitMessage, truncateKey, usageLabel } from "./format";

describe("format", () => {
  it("truncates long public keys and keeps short ones", () => {
    expect(truncateKey("pk_2cfb1e931e564ee2a9095893478c1a0f")).toBe("pk_2cfb1e93…8c1a0f");
    expect(truncateKey("pk_short")).toBe("pk_short");
  });

  it("formats the created date in UTC", () => {
    expect(formatCreated("2026-11-11T23:40:07.424038+00:00")).toBe("Nov 11, 2026");
    expect(formatCreated("not a date")).toBe("");
  });

  it("shows usage against the plan's monthly limit", () => {
    expect(usageLabel(12, "free")).toBe("12 / 100 messages this month");
    expect(usageLabel(1500, "pro")).toBe("1,500 / 2,000 messages this month");
  });

  it("uses the upgrade copy on Free and the server's message on Pro", () => {
    expect(planLimitMessage("free", "x")).toBe("Free includes 1 project. Upgrade to Pro for 5.");
    expect(planLimitMessage("pro", "Your plan includes 5 projects.")).toBe("Your plan includes 5 projects.");
  });
});
