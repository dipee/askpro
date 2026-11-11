import { z } from "zod";
import { WIDGET_ANIMATIONS, type WidgetAnimation } from "./widget";

/** Plans an account can be on. Matches `accounts.plan`. */
export const PLANS = ["free", "pro"] as const;
export type Plan = (typeof PLANS)[number];
export const planSchema = z.enum(PLANS);

export interface PlanLimits {
  /** Projects per account. */
  projects: number;
  /** Accepted widget messages per project per month. */
  messagesPerMonth: number;
  /** Knowledge sources per project (files and pasted texts together). */
  knowledgeSources: number;
  /** May set any button color. */
  customColor: boolean;
  /** May put the button in any corner (else bottom right only). */
  anyPosition: boolean;
  /** May set a custom button label. */
  customLabel: boolean;
  /** Open animations the plan may use. */
  animations: readonly WidgetAnimation[];
  /** May set custom header text. */
  customHeader: boolean;
  /** May hide the "Powered by" badge. */
  canHideBadge: boolean;
}

/** The only place plan limits live (project.md §5). */
export const PLAN_LIMITS = {
  free: {
    projects: 1,
    messagesPerMonth: 100,
    knowledgeSources: 3,
    customColor: false,
    anyPosition: false,
    customLabel: false,
    animations: ["fade"],
    customHeader: false,
    canHideBadge: false,
  },
  pro: {
    projects: 5,
    messagesPerMonth: 2000,
    knowledgeSources: 25,
    customColor: true,
    anyPosition: true,
    customLabel: true,
    animations: WIDGET_ANIMATIONS,
    customHeader: true,
    canHideBadge: true,
  },
} as const satisfies Record<Plan, PlanLimits>;

/** Monthly price in US dollars. */
export const PLAN_PRICE_USD = { free: 0, pro: 19 } as const satisfies Record<Plan, number>;
