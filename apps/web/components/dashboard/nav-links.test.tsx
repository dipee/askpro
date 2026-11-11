import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isNavItemActive } from "./nav-items";
import { NavLinks } from "./nav-links";

/** The label of each link marked aria-current="page". */
function activeLabels(pathname: string): string[] {
  const html = renderToStaticMarkup(<NavLinks pathname={pathname} />);
  return [...html.matchAll(/<a [^>]*aria-current="page"[^>]*>([^<]+)<\/a>/g)].map((m) => m[1]!);
}

describe("NavLinks", () => {
  it("renders Projects and Billing links", () => {
    const html = renderToStaticMarkup(<NavLinks pathname="/dashboard" />);
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/dashboard/billing"');
    expect(html).toContain(">Projects<");
    expect(html).toContain(">Billing<");
  });

  it.each([
    ["/dashboard", ["Projects"]],
    ["/dashboard/projects/abc/knowledge", ["Projects"]],
    ["/dashboard/billing", ["Billing"]],
    ["/dashboard/billing/invoices", ["Billing"]],
  ])("on %s highlights only %j", (pathname, expected) => {
    expect(activeLabels(pathname)).toEqual(expected);
  });
});

describe("isNavItemActive", () => {
  it("matches on segment boundaries", () => {
    expect(isNavItemActive("/dashboard/billingx", "/dashboard/billing")).toBe(false);
    expect(isNavItemActive("/dashboard/billing", "/dashboard")).toBe(false);
  });
});
