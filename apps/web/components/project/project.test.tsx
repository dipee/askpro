import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComingSoon } from "./coming-soon";
import { CopySnippetView } from "./copy-snippet";
import { PROJECT_TABS, ProjectTabLinks } from "./project-tab-links";

const ID = "11111111-1111-4111-8111-111111111111";
const SNIPPET = `<script src="https://x.vercel.app/widget.js" data-key="pk_abc" async></script>`;
const noop = () => {};

describe("ProjectTabLinks", () => {
  it("links all four tabs and marks the current one", () => {
    const html = renderToStaticMarkup(<ProjectTabLinks projectId={ID} pathname={`/dashboard/projects/${ID}/knowledge`} />);
    for (const { slug, label } of PROJECT_TABS) {
      expect(html).toContain(`href="/dashboard/projects/${ID}/${slug}"`);
      expect(html).toContain(`>${label}</a>`);
    }
    expect([...html.matchAll(/aria-current="page"[^>]*>([^<]+)</g)].map((m) => m[1])).toEqual(["Knowledge"]);
  });
});

describe("CopySnippetView", () => {
  it("shows the snippet as text with a Copy button", () => {
    const html = renderToStaticMarkup(<CopySnippetView snippet={SNIPPET} state="idle" onCopy={noop} />);
    expect(html).toContain("&lt;script src=&quot;https://x.vercel.app/widget.js&quot; data-key=&quot;pk_abc&quot; async&gt;&lt;/script&gt;");
    expect(html).toContain(">Copy snippet</button>");
    expect(html).not.toContain("<script");
  });

  it("shows Copied after copying, and the manual hint when the clipboard is blocked", () => {
    expect(renderToStaticMarkup(<CopySnippetView snippet={SNIPPET} state="copied" onCopy={noop} />)).toContain(">Copied</button>");
    expect(renderToStaticMarkup(<CopySnippetView snippet={SNIPPET} state="manual" onCopy={noop} />)).toContain("Press Ctrl+C");
  });
});

describe("ComingSoon", () => {
  it("renders an empty state", () => {
    expect(renderToStaticMarkup(<ComingSoon title="Knowledge" description="Soon." />)).toContain("Knowledge is coming soon");
  });
});
