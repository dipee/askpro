import { PLAN_LIMITS, type Plan } from "@askwell/shared";

/** `pk_2cfb1e93…8c1a0f`: enough to recognise a key without the full width. */
export function truncateKey(key: string): string {
  return key.length <= 18 ? key : `${key.slice(0, 11)}…${key.slice(-6)}`;
}

const DATE = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/** Created date, e.g. "Nov 11, 2026". UTC so server and browser render the same text. */
export function formatCreated(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : DATE.format(date);
}

/** What to show when a create is refused at the plan limit. */
export function planLimitMessage(plan: Plan, serverMessage: string): string {
  return plan === "free"
    ? `Free includes ${PLAN_LIMITS.free.projects} project. Upgrade to Pro for ${PLAN_LIMITS.pro.projects}.`
    : serverMessage;
}
