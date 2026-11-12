import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { KnowledgeSource } from "@askwell/shared";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const { KnowledgeManager } = await import("./knowledge-manager");
const { KnowledgeHeader, PasteForm, UploadForm, SourceList, StatusBadge } = await import("./knowledge-views");

const PID = "11111111-1111-4111-8111-111111111111";
const source = (n: number, patch: Partial<KnowledgeSource> = {}): KnowledgeSource => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  projectId: PID,
  title: `Source ${n}`,
  type: "pdf",
  status: "ready",
  createdAt: "2026-11-12T10:00:00+00:00",
  ...patch,
});
const noop = () => {};
const IDLE = { confirming: false, deleting: false, error: null };

/** The add buttons as rendered, with whether each is disabled. */
function addButtons(html: string) {
  return [...html.matchAll(/<button[^>]*?(disabled="")?[^>]*>(Paste text|Upload file)<\/button>/g)].map((m) => ({
    label: m[2],
    disabled: /disabled=""/.test(m[0]),
  }));
}

describe("KnowledgeManager: limit state", () => {
  it("Free with 2 of 3: usage shown, adding enabled, no hint", () => {
    const html = renderToStaticMarkup(<KnowledgeManager projectId={PID} plan="free" sources={[source(1), source(2)]} />);
    expect(html).toContain("2 of 3 sources used");
    expect(addButtons(html)).toEqual([
      { label: "Paste text", disabled: false },
      { label: "Upload file", disabled: false },
    ]);
    expect(html).not.toContain("Upgrade to Pro");
  });

  it("Free with 3 of 3: both add buttons disabled, upgrade hint with a link to plans", () => {
    const html = renderToStaticMarkup(
      <KnowledgeManager projectId={PID} plan="free" sources={[source(1), source(2), source(3)]} />,
    );
    expect(html).toContain("3 of 3 sources used");
    expect(addButtons(html)).toEqual([
      { label: "Paste text", disabled: true },
      { label: "Upload file", disabled: true },
    ]);
    expect(html).toContain("Free includes 3 sources per project. Upgrade to Pro for 25, or delete one.");
    expect(html).toContain('href="/dashboard/billing"');
  });

  it("Pro with 3: well under 25, adding enabled", () => {
    const html = renderToStaticMarkup(
      <KnowledgeManager projectId={PID} plan="pro" sources={[source(1), source(2), source(3)]} />,
    );
    expect(html).toContain("3 of 25 sources used");
    expect(addButtons(html).every((b) => !b.disabled)).toBe(true);
  });

  it("Pro at 25: disabled, with a delete hint and no upgrade link", () => {
    const sources = Array.from({ length: 25 }, (_, i) => source(1, { id: `s${i}` }));
    const html = renderToStaticMarkup(<KnowledgeManager projectId={PID} plan="pro" sources={sources} />);
    expect(addButtons(html).every((b) => b.disabled)).toBe(true);
    expect(html).toContain("Delete one to add another.");
    expect(html).not.toContain('href="/dashboard/billing"');
  });

  it("an uploading reservation counts toward the limit", () => {
    const html = renderToStaticMarkup(
      <KnowledgeManager
        projectId={PID}
        plan="free"
        sources={[source(1), source(2), source(3, { status: "uploading" })]}
      />,
    );
    expect(addButtons(html).every((b) => b.disabled)).toBe(true);
  });
});

describe("KnowledgeManager: list", () => {
  it("shows the empty state with no sources", () => {
    const html = renderToStaticMarkup(<KnowledgeManager projectId={PID} plan="free" sources={[]} />);
    expect(html).toContain("No knowledge yet");
    expect(html).toContain("0 of 3 sources used");
  });

  it("shows title, type, date and status for each source; uploading shows as Processing", () => {
    const html = renderToStaticMarkup(
      <KnowledgeManager
        projectId={PID}
        plan="free"
        sources={[
          source(1, { title: "Refund policy", type: "text", status: "ready" }),
          source(2, { title: "Manual", type: "pdf", status: "uploading" }),
          source(3, { title: "FAQ", type: "md", status: "processing" }),
        ]}
      />,
    );
    expect(html).toContain("Refund policy");
    expect(html).toContain("Nov 12, 2026");
    expect(html.match(/data-status="(\w+)"/g)).toEqual([
      'data-status="Ready"',
      'data-status="Processing"',
      'data-status="Processing"',
    ]);
    for (const label of [">Text<", ">PDF<", ">Markdown<"]) expect(html).toContain(label);
    expect(html).not.toContain("uploading");
  });

  it("a failed source says to delete it and add it again", () => {
    const html = renderToStaticMarkup(
      <KnowledgeManager projectId={PID} plan="free" sources={[source(1, { status: "failed" })]} />,
    );
    expect(html).toContain('data-status="Failed"');
    expect(html).toContain("Delete it and add it again.");
  });

  it("renders titles as text, never HTML", () => {
    const html = renderToStaticMarkup(
      <KnowledgeManager projectId={PID} plan="free" sources={[source(1, { title: "<img src=x onerror=alert(1)>" })]} />,
    );
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<img");
  });
});

describe("SourceList: delete", () => {
  const item = { key: "a", id: "a", title: "Manual", type: "pdf" as const, status: "Ready" as const, createdAt: null };
  const list = (state: typeof IDLE) =>
    renderToStaticMarkup(
      <SourceList items={[item]} rowState={() => state} onStartDelete={noop} onConfirmDelete={noop} onCancelDelete={noop} />,
    );

  it("has a Delete button that asks to confirm first", () => {
    expect(list(IDLE)).toContain('aria-label="Delete Manual"');
    const confirming = list({ confirming: true, deleting: false, error: null });
    expect(confirming).toContain("Delete this source?");
    expect(confirming).toContain(">Cancel<");
  });

  it("shows Deleting… and a delete error", () => {
    expect(list({ confirming: true, deleting: true, error: null })).toContain("Deleting…");
    expect(list({ confirming: true, deleting: false, error: "Couldn't reach the server." })).toContain(
      "Couldn&#x27;t reach the server.",
    );
  });

  it("has no Delete while a file is still uploading in this tab", () => {
    const html = renderToStaticMarkup(
      <SourceList
        items={[{ ...item, status: "Processing", progress: 0.4 }]}
        rowState={() => IDLE}
        onStartDelete={noop}
        onConfirmDelete={noop}
        onCancelDelete={noop}
      />,
    );
    expect(html).toContain("Uploading 40%");
    expect(html).not.toContain("Delete Manual");
  });
});

describe("forms", () => {
  it("the paste form limits title and text length and shows its error", () => {
    const html = renderToStaticMarkup(
      <PasteForm title="" text="abc" error="Give the text a title." pending={false} onTitle={noop} onText={noop} onSubmit={noop} onCancel={noop} />,
    );
    expect(html).toContain('maxLength="200"');
    expect(html).toContain('maxLength="100000"');
    expect(html).toContain("3 / 100,000 characters");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Give the text a title.");
  });

  it("the upload form accepts only PDF, Markdown and TXT, and shows a clear refusal", () => {
    const html = renderToStaticMarkup(
      <UploadForm
        title=""
        file={{ name: "huge.pdf", size: 12 * 1024 * 1024 }}
        error="This file is 12.0 MB. Files can be up to 10 MB."
        pending={false}
        onTitle={noop}
        onFile={noop}
        onSubmit={noop}
        onCancel={noop}
      />,
    );
    expect(html).toContain('accept=".pdf,.md,.txt,application/pdf,text/markdown,text/plain"');
    expect(html).toContain("huge.pdf · 12.0 MB");
    expect(html).toContain("This file is 12.0 MB. Files can be up to 10 MB.");
  });

  it("forms disable while sending", () => {
    const html = renderToStaticMarkup(
      <PasteForm title="T" text="x" error={null} pending onTitle={noop} onText={noop} onSubmit={noop} onCancel={noop} />,
    );
    expect(html).toContain("Adding…");
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("the header hides the hint below the limit", () => {
    const html = renderToStaticMarkup(<KnowledgeHeader plan="free" used={1} atLimit={false} mode="none" busy={false} onMode={noop} />);
    expect(html).toContain("1 of 3 sources used");
    expect(html).not.toContain('role="status"');
  });

  it("status badge text", () => {
    expect(renderToStaticMarkup(<StatusBadge status="Ready" />)).toContain(">Ready<");
  });
});
