import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { THEME_CHOICES } from "../../lib/theme";
import { ThemeOptions } from "./theme-chooser";

// Clerk's UserButton as plain markup, so the custom item and page can be inspected.
vi.mock("@clerk/nextjs", () => {
  function UserButton({ children }: { children?: ReactNode }) {
    return <div data-clerk="user-button">{children}</div>;
  }
  function MenuItems({ children }: { children?: ReactNode }) {
    return <ul data-clerk="menu-items">{children}</ul>;
  }
  function Action({ label, open }: { label: string; open?: string }) {
    return (
      <li data-clerk="action" data-open={open}>
        {label}
      </li>
    );
  }
  function UserProfilePage({ label, url, children }: { label: string; url: string; children?: ReactNode }) {
    return (
      <section data-clerk="page" data-url={url} aria-label={label}>
        {children}
      </section>
    );
  }
  return { UserButton: Object.assign(UserButton, { MenuItems, Action, UserProfilePage }) };
});

const { UserMenu } = await import("./user-menu");

describe("ThemeOptions", () => {
  it.each(THEME_CHOICES)("renders System, Light and Dark with %s checked", (value) => {
    const html = renderToStaticMarkup(<ThemeOptions value={value} onChange={() => {}} />);
    expect(html).toContain("<legend");
    for (const label of ["System", "Light", "Dark"]) expect(html).toContain(`>${label}<`);
    const radios = [...html.matchAll(/<input[^>]*type="radio"[^>]*>/g)].map((m) => m[0]);
    expect(radios).toHaveLength(3);
    const checked = radios.filter((r) => r.includes("checked"));
    expect(checked).toHaveLength(1);
    expect(checked[0]).toContain(`value="${value}"`);
  });
});

describe("UserMenu", () => {
  it("adds an Appearance item that opens the theme page", () => {
    const html = renderToStaticMarkup(<UserMenu />);
    expect(html).toMatch(/<li data-clerk="action" data-open="appearance">Appearance<\/li>/);
    expect(html).toMatch(/<section data-clerk="page" data-url="appearance" aria-label="Appearance">/);
    // The page holds the chooser; it defaults to System on the server.
    expect(html).toMatch(/<input[^>]*checked=""[^>]*value="system"/);
  });
});
