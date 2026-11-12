import { PLAN_LIMITS } from "@askwell/shared";
import { describe, expect, it } from "vitest";
import { currentUsage, usageLabel } from "./usage";

const NOV = "2026-11-01T00:00:00+00:00";

describe("currentUsage", () => {
  it("uses the stored count in the same UTC month, with the plan's limit", () => {
    const now = new Date("2026-11-12T08:00:00Z");
    expect(currentUsage({ messagesUsed: 12, periodStart: NOV }, "free", now)).toEqual({
      used: 12,
      limit: PLAN_LIMITS.free.messagesPerMonth,
      ratio: 0.12,
      nearLimit: false,
      atLimit: false,
    });
    expect(currentUsage({ messagesUsed: 12, periodStart: NOV }, "pro", now).limit).toBe(
      PLAN_LIMITS.pro.messagesPerMonth,
    );
  });

  describe("month boundary (UTC)", () => {
    const project = { messagesUsed: 80, periodStart: NOV };

    it("keeps the count on the last millisecond of the month", () => {
      expect(currentUsage(project, "free", new Date("2026-11-30T23:59:59.999Z")).used).toBe(80);
    });

    it("shows 0 from the first millisecond of the next month (lazy reset)", () => {
      expect(currentUsage(project, "free", new Date("2026-12-01T00:00:00.000Z")).used).toBe(0);
    });

    it("goes by UTC, not the local offset of period_start", () => {
      // 2026-11-30T23:30 at -05:00 is already Dec 1 in UTC.
      const decInUtc = { messagesUsed: 5, periodStart: "2026-11-30T23:30:00-05:00" };
      expect(currentUsage(decInUtc, "free", new Date("2026-12-15T00:00:00Z")).used).toBe(5);
    });

    it("resets across a year boundary and after skipped months", () => {
      const dec = { messagesUsed: 40, periodStart: "2026-12-01T00:00:00Z" };
      expect(currentUsage(dec, "free", new Date("2027-01-01T00:00:00Z")).used).toBe(0);
      expect(currentUsage(project, "free", new Date("2027-03-10T00:00:00Z")).used).toBe(0);
    });
  });

  it("flags near limit at 90% and at limit at 100%", () => {
    const now = new Date("2026-11-12T00:00:00Z");
    const at = (n: number) => currentUsage({ messagesUsed: n, periodStart: NOV }, "free", now);
    expect(at(89)).toMatchObject({ nearLimit: false, atLimit: false });
    expect(at(90)).toMatchObject({ nearLimit: true, atLimit: false });
    expect(at(100)).toMatchObject({ nearLimit: true, atLimit: true, ratio: 1 });
  });

  it("clamps the ratio when a downgrade leaves the count above the limit", () => {
    const now = new Date("2026-11-12T00:00:00Z");
    expect(currentUsage({ messagesUsed: 1500, periodStart: NOV }, "free", now)).toMatchObject({
      used: 1500,
      ratio: 1,
      atLimit: true,
    });
  });
});

describe("usageLabel", () => {
  it("formats used / limit", () => {
    expect(usageLabel({ used: 12, limit: 100 })).toBe("12 / 100 messages this month");
    expect(usageLabel({ used: 1500, limit: 2000 })).toBe("1,500 / 2,000 messages this month");
  });
});
