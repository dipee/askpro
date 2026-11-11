import Link from "next/link";
import { PLAN_LIMITS, PLAN_PRICE_USD, type Plan, type PlanLimits } from "@askwell/shared";
import { Reveal } from "./reveal";
import { Section } from "./section";
import { glass, primaryCta, secondaryCta } from "./styles";

const count = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;

/** Feature lines for a plan, built from PLAN_LIMITS (project.md §5). */
export function planFeatures(limits: PlanLimits): string[] {
  const custom = [
    limits.customColor && "color",
    limits.anyPosition && "position",
    limits.customLabel && "label",
    limits.customHeader && "header text",
  ].filter((x): x is string => Boolean(x));
  return [
    plural(limits.projects, "project", "projects"),
    `${count(limits.messagesPerMonth)} messages / month per project`,
    `${plural(limits.knowledgeSources, "knowledge source", "knowledge sources")} per project`,
    custom.length > 0 ? `Custom button ${custom.join(", ")}` : "Default widget look",
    `${limits.animations.length > 1 ? "Open animations" : "Open animation"}: ${limits.animations.join(" / ")}`,
    limits.canHideBadge ? "Hide the “Powered by” badge" : "“Powered by” badge shown",
  ];
}

const PLAN_COPY: Record<Plan, { name: string; blurb: string; cta: string }> = {
  free: { name: "Free", blurb: "Try it on one site.", cta: "Start free" },
  pro: { name: "Pro", blurb: "For businesses with more to answer.", cta: "Start free, upgrade anytime" },
};

export function Pricing() {
  const plans: Plan[] = ["free", "pro"];
  return (
    <Section id="pricing" eyebrow="Pricing" title="Simple pricing" intro="Start free. Upgrade when you need more.">
      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((plan) => {
          const copy = PLAN_COPY[plan];
          const featured = plan === "pro";
          return (
            <Reveal key={plan} className="h-full">
              <article
                data-plan={plan}
                className={`${glass} flex h-full flex-col p-6 sm:p-8 ${featured ? "border-white/30" : ""}`}
              >
                <h3 className="text-lg font-semibold">{copy.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{copy.blurb}</p>
                <p className="mt-6 flex items-baseline gap-1">
                  <span className="text-5xl font-semibold tracking-tight">${PLAN_PRICE_USD[plan]}</span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </p>
                <ul className="mt-8 flex flex-1 flex-col gap-3 text-sm">
                  {planFeatures(PLAN_LIMITS[plan]).map((f) => (
                    <li key={f} className="flex gap-3">
                      <span aria-hidden="true" className="text-muted-foreground">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/sign-up" className={`${featured ? primaryCta : secondaryCta} mt-8 w-full`}>
                  {copy.cta}
                </Link>
              </article>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}
