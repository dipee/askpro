import { PLAN_LIMITS, type Plan, type Project } from "@askwell/shared";

/** From this share of the limit, the dashboard warns that the widget will stop answering. */
export const NEAR_LIMIT_RATIO = 0.9;

export type Usage = {
  /** Messages counted this UTC month. */
  used: number;
  /** The plan's monthly limit per project. */
  limit: number;
  /** used / limit, clamped to 0..1 (a downgrade can leave used above the limit). */
  ratio: number;
  /** At or above NEAR_LIMIT_RATIO of the limit. */
  nearLimit: boolean;
  /** At or above the limit: the widget shows the quota message. */
  atLimit: boolean;
};

/** Start of `date`'s month in UTC, in ms. */
function utcMonthStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

/**
 * This month's usage for a project. consume_message resets the count lazily, on the
 * first message of a new month, so a period_start in an earlier UTC month than `now`
 * means nothing has been counted yet this month: used = 0. The limit comes from
 * PLAN_LIMITS for the plan the server read.
 */
export function currentUsage(
  project: Pick<Project, "messagesUsed" | "periodStart">,
  plan: Plan,
  now: Date,
): Usage {
  const limit = PLAN_LIMITS[plan].messagesPerMonth;
  const periodStart = new Date(project.periodStart);
  const stale = Number.isNaN(periodStart.getTime()) || utcMonthStart(periodStart) < utcMonthStart(now);
  const used = stale ? 0 : Math.max(0, project.messagesUsed);
  const ratio = Math.min(1, used / limit);
  return { used, limit, ratio, nearLimit: ratio >= NEAR_LIMIT_RATIO, atLimit: used >= limit };
}

/** "12 / 100 messages this month". */
export function usageLabel({ used, limit }: Pick<Usage, "used" | "limit">): string {
  return `${used.toLocaleString("en")} / ${limit.toLocaleString("en")} messages this month`;
}
