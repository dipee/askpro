import { describe, expect, it } from "vitest";
import { PLAN_LIMITS, PLAN_PRICE_USD, planSchema } from "./plans";

describe("PLAN_LIMITS (project.md §5)", () => {
  it("Free", () => {
    expect(PLAN_LIMITS.free).toEqual({
      projects: 1,
      messagesPerMonth: 100,
      knowledgeSources: 3,
      customColor: false,
      anyPosition: false,
      customLabel: false,
      animations: ["fade"],
      customHeader: false,
      canHideBadge: false,
    });
  });

  it("Pro", () => {
    expect(PLAN_LIMITS.pro).toEqual({
      projects: 5,
      messagesPerMonth: 2000,
      knowledgeSources: 25,
      customColor: true,
      anyPosition: true,
      customLabel: true,
      animations: ["fade", "slide", "scale"],
      customHeader: true,
      canHideBadge: true,
    });
  });

  it("prices", () => {
    expect(PLAN_PRICE_USD).toEqual({ free: 0, pro: 19 });
  });
});

describe("planSchema", () => {
  it("accepts a plan", () => expect(planSchema.safeParse("pro").success).toBe(true));
  it("rejects an unknown plan", () => expect(planSchema.safeParse("team").success).toBe(false));
});
