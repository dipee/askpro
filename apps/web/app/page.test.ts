import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { APP_NAME, PLAN_LIMITS, PLAN_PRICE_USD } from "@askwell/shared";
import { describe, expect, it } from "vitest";
import { planFeatures } from "../components/landing/pricing";
import Home, { metadata } from "./page";

const html = renderToStaticMarkup(createElement(Home));
const n = (x: number) => x.toLocaleString("en-US");

/** The markup of one pricing card. */
function planCard(plan: "free" | "pro"): string {
  const m = html.match(new RegExp(`<article[^>]*data-plan="${plan}"[^>]*>([\\s\\S]*?)</article>`));
  expect(m, `pricing card for ${plan}`).not.toBeNull();
  return m![1]!;
}

describe("landing page", () => {
  it("renders APP_NAME in the hero and uses it in metadata", () => {
    expect(html).toMatch(new RegExp(`<h1[^>]*>${APP_NAME}</h1>`));
    expect(String(metadata.title)).toContain(APP_NAME);
    expect(String(metadata.description)).toContain(APP_NAME);
  });

  it("has every section", () => {
    for (const id of ["how-it-works", "demo", "pricing", "install"]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain("<footer");
    expect(html).toContain("not live");
  });

  it("links every Start free CTA to /sign-up", () => {
    const ctas = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>Start free<\/a>/g)];
    expect(ctas.length).toBeGreaterThan(0);
    for (const [, href] of ctas) expect(href).toBe("/sign-up");
  });

  it.each(["free", "pro"] as const)("%s pricing shows price and limits from packages/shared", (plan) => {
    const card = planCard(plan);
    const limits = PLAN_LIMITS[plan];
    expect(card).toContain(`$${PLAN_PRICE_USD[plan]}`);
    expect(card).toContain("/month");
    expect(card).toContain(`${n(limits.projects)} project`);
    expect(card).toContain(`${n(limits.messagesPerMonth)} messages / month`);
    expect(card).toContain(`${n(limits.knowledgeSources)} knowledge source`);
    for (const feature of planFeatures(limits)) {
      expect(card).toContain(feature);
    }
  });

  it("matches project.md §5 (Free $0, Pro $19/month)", () => {
    expect(planCard("free")).toContain("$0");
    expect(planCard("pro")).toContain("$19");
  });

  it("shows the install snippet as escaped text", () => {
    expect(html).toContain("&lt;script src=");
    expect(html).not.toMatch(/<script[^>]*widget\.js/);
  });
});
