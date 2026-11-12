import { readdir, readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Project } from "@askwell/shared";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const { ProjectList } = await import("./project-list");
const { ProjectCardView } = await import("./project-card-view");
const { CreateProjectDialog } = await import("./create-project-dialog");

const PROJECTS: Project[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Help desk",
    publicKey: "pk_2cfb1e931e564ee2a9095893478c1a0f",
    messagesUsed: 12,
    periodStart: "2026-11-01T00:00:00+00:00",
    createdAt: "2026-11-11T10:00:00+00:00",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "<b>Docs</b>",
    publicKey: "pk_bd16607bc2764628b5984095049a6ea4",
    messagesUsed: 0,
    periodStart: "2026-11-01T00:00:00+00:00",
    createdAt: "2026-11-10T10:00:00+00:00",
  },
];

/** Mid-November 2026, the month the fixtures' period_start is in. */
const NOW = new Date("2026-11-12T12:00:00Z");

const noop = () => {};
const cardProps = {
  project: PROJECTS[0]!,
  usage: { used: 12, limit: 100, ratio: 0.12, nearLimit: false, atLimit: false },
  draftName: "Help desk",
  error: null,
  pending: false,
  onStartRename: noop,
  onDraftChange: noop,
  onSaveRename: noop,
  onStartDelete: noop,
  onConfirmDelete: noop,
  onCancel: noop,
};

describe("ProjectList", () => {
  it("renders a card per project: name, truncated key, usage vs limit, created date, link", () => {
    const html = renderToStaticMarkup(<ProjectList projects={PROJECTS} plan="free" now={NOW} />);
    expect(html).toContain(">Help desk</a>");
    expect(html).toContain('href="/dashboard/projects/11111111-1111-4111-8111-111111111111"');
    expect(html).toContain("pk_2cfb1e93…8c1a0f");
    expect(html).toContain("12 / 100 messages this month");
    expect(html).toContain("Nov 11, 2026");
    expect(html.match(/data-project-id=/g)).toHaveLength(2);
  });

  it("renders project names as text, never HTML", () => {
    const html = renderToStaticMarkup(<ProjectList projects={PROJECTS} plan="free" now={NOW} />);
    expect(html).toContain("&lt;b&gt;Docs&lt;/b&gt;");
    expect(html).not.toContain("<b>Docs");
  });

  it("uses the Pro limit for a Pro owner", () => {
    expect(renderToStaticMarkup(<ProjectList projects={PROJECTS} plan="pro" now={NOW} />)).toContain("12 / 2,000 messages");
  });

  it("shows 0 once a new UTC month starts, before consume_message resets the row", () => {
    const html = renderToStaticMarkup(
      <ProjectList projects={[PROJECTS[0]!]} plan="free" now={new Date("2026-12-01T00:00:00Z")} />,
    );
    expect(html).toContain("0 / 100 messages this month");
  });

  it("shows the quota hint on a card at the limit", () => {
    const full = { ...PROJECTS[0]!, messagesUsed: 100 };
    const html = renderToStaticMarkup(<ProjectList projects={[full]} plan="free" now={NOW} />);
    expect(html).toContain("100 / 100 messages this month");
    expect(html).toContain("Limit reached.");
  });

  it("empty: keeps 'No projects yet' with an enabled New project button", () => {
    const html = renderToStaticMarkup(<ProjectList projects={[]} plan="free" />);
    expect(html).toContain("No projects yet");
    const button = html.match(/<button[^>]*>New project<\/button>/)?.[0];
    expect(button).toBeDefined();
    expect(button).not.toMatch(/\sdisabled=""/);
  });
});

describe("ProjectCardView", () => {
  it("view mode: Open, Rename and Delete, no confirm step", () => {
    const html = renderToStaticMarkup(<ProjectCardView {...cardProps} mode="view" />);
    expect(html).toContain(">Rename</button>");
    expect(html).toContain(">Delete</button>");
    expect(html).not.toContain('role="alertdialog"');
  });

  it("delete asks for confirmation inside the card first", () => {
    const html = renderToStaticMarkup(<ProjectCardView {...cardProps} mode="confirm-delete" />);
    expect(html).toContain('role="alertdialog"');
    expect(html).toMatch(/Delete <span[^>]*>Help desk<\/span>\?/);
    expect(html).toContain(">Delete project</button>");
    expect(html).toContain(">Cancel</button>");
    expect(html).not.toContain(">Rename</button>");
  });

  it("rename mode shows the name field with the shared length limit", () => {
    const html = renderToStaticMarkup(<ProjectCardView {...cardProps} mode="rename" />);
    expect(html).toMatch(/<input[^>]*maxLength="60"[^>]*value="Help desk"/);
    expect(html).toContain(">Save</button>");
  });

  it("delete confirm puts focus on Cancel", () => {
    const html = renderToStaticMarkup(<ProjectCardView {...cardProps} mode="confirm-delete" />);
    expect(html).toMatch(/<button[^>]*autofocus=""[^>]*>Cancel<\/button>/i);
  });

  it.each([
    ["delete", "Delete"],
    ["rename", "Rename"],
  ] as const)("after cancel, focus returns to %s", (returnFocus, label) => {
    const html = renderToStaticMarkup(<ProjectCardView {...cardProps} mode="view" returnFocus={returnFocus} />);
    const focused = [...html.matchAll(/<button[^>]*autofocus=""[^>]*>([^<]+)<\/button>/gi)].map((m) => m[1]);
    expect(focused).toEqual([label]);
  });

  it("view mode with no returnFocus focuses nothing", () => {
    expect(renderToStaticMarkup(<ProjectCardView {...cardProps} mode="view" />)).not.toMatch(/autofocus/i);
  });

  it("shows an error from the server", () => {
    const html = renderToStaticMarkup(<ProjectCardView {...cardProps} mode="view" error="Project not found." />);
    expect(html).toMatch(/role="alert"[^>]*>Project not found\.</);
  });

  it("no component here uses window.confirm", async () => {
    const dir = new URL("./", import.meta.url);
    for (const file of await readdir(dir)) {
      if (file.endsWith(".test.tsx") || file.endsWith(".test.ts")) continue;
      expect(await readFile(new URL(file, dir), "utf8"), file).not.toMatch(/\bconfirm\(/);
    }
  });
});

describe("CreateProjectDialog", () => {
  const dialog = (error: Parameters<typeof CreateProjectDialog>[0]["error"]) =>
    renderToStaticMarkup(
      <CreateProjectDialog name="Second" error={error} pending={false} onNameChange={noop} onSubmit={noop} onClose={noop} />,
    );

  it("shows the upgrade message and a link to billing on plan_limit", () => {
    const html = dialog({ message: "Free includes 1 project. Upgrade to Pro for 5.", planLimit: true });
    expect(html).toContain("Free includes 1 project. Upgrade to Pro for 5.");
    expect(html).toContain('href="/dashboard/billing"');
    expect(html).toMatch(/<button type="submit"[^>]*\sdisabled=""/);
  });

  it("shows other errors without the billing link", () => {
    const html = dialog({ message: "Something went wrong.", planLimit: false });
    expect(html).toContain("Something went wrong.");
    expect(html).not.toContain("/dashboard/billing");
  });

  it("is a native <dialog> (opened with showModal) with the shared name limit", () => {
    const html = dialog(null);
    expect(html).toMatch(/^<dialog[^>]*aria-labelledby="new-project-title"/);
    expect(html).toMatch(/<input[^>]*maxLength="60"/);
  });
});
