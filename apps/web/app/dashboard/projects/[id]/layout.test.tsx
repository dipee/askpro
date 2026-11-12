import { existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getOwnedProject: vi.fn(),
  ensureAccount: vi.fn(),
  protect: vi.fn(async () => {}),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: Object.assign(async () => ({}), { protect: h.protect }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => "/dashboard/projects/11111111-1111-4111-8111-111111111111/install",
}));
vi.mock("../../../../lib/projects", () => ({ getOwnedProject: h.getOwnedProject }));
vi.mock("../../../../lib/accounts", () => ({ ensureAccount: h.ensureAccount }));

const { default: ProjectLayout } = await import("./layout");

const ID = "11111111-1111-4111-8111-111111111111";
const render = (id: string) =>
  ProjectLayout({ params: Promise.resolve({ id }), children: <p>child</p> }).then((el) => renderToStaticMarkup(el));

beforeEach(() => {
  h.getOwnedProject.mockReset();
  h.ensureAccount.mockReset();
  h.ensureAccount.mockResolvedValue({ plan: "free" });
  h.protect.mockClear();
});

/** An owned project with `messagesUsed` counted in the current UTC month. */
const project = (messagesUsed = 3) => ({
  id: ID,
  name: "<b>Desk</b>",
  publicKey: "pk_1",
  messagesUsed,
  periodStart: new Date().toISOString(),
});

describe("project layout", () => {
  it("404s when the project isn't the owner's (RLS returns null)", async () => {
    h.getOwnedProject.mockResolvedValue(null);
    await expect(render(ID)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(h.getOwnedProject).toHaveBeenCalledWith(ID);
  });

  it("404s for a malformed id without querying", async () => {
    await expect(render("not-a-uuid")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(h.getOwnedProject).not.toHaveBeenCalled();
  });

  it("requires a session", async () => {
    h.getOwnedProject.mockResolvedValue(null);
    await render(ID).catch(() => {});
    expect(h.protect).toHaveBeenCalled();
  });

  it("shows the back link, name (as text), tabs and the tab content for an owned project", async () => {
    h.getOwnedProject.mockResolvedValue(project());
    const html = await render(ID);
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain("&lt;b&gt;Desk&lt;/b&gt;");
    expect(html).toContain(`href="/dashboard/projects/${ID}/install"`);
    expect(html).toContain("<p>child</p>");
  });

  it("shows this month's usage under the name, with the limit from the server-read plan", async () => {
    h.getOwnedProject.mockResolvedValue(project(3));
    h.ensureAccount.mockResolvedValue({ plan: "pro" });
    const html = await render(ID);
    expect(html).toContain("3 / 2,000 messages this month");
    expect(html).not.toContain("Limit reached.");
  });

  it("shows the quota hint at the limit", async () => {
    h.getOwnedProject.mockResolvedValue(project(100));
    const html = await render(ID);
    expect(html).toContain("100 / 100 messages this month");
    expect(html).toContain("Limit reached.");
  });

  it("still renders the project when the plan can't be read", async () => {
    h.getOwnedProject.mockResolvedValue(project());
    h.ensureAccount.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const html = await render(ID);
    expect(html).toContain("Usage is unavailable");
    expect(html).toContain("<p>child</p>");
  });
});

describe("streaming before notFound()", () => {
  // A loading.tsx in any segment above [id] wraps this layout in Suspense, so Next.js
  // streams a 200 before the ownership check can call notFound(). Keep them out.
  it.each(["../../../loading.tsx", "../../loading.tsx", "../loading.tsx"])(
    "no loading.tsx above the project layout (%s)",
    (path) => {
      expect(existsSync(new URL(path, import.meta.url))).toBe(false);
    },
  );

  it("the project's own loading.tsx sits below the layout", () => {
    expect(existsSync(new URL("./loading.tsx", import.meta.url))).toBe(true);
  });
});
