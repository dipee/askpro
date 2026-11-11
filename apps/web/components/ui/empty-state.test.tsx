import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./button";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders the title, description and action", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        title="No projects yet"
        description="Create one to start."
        action={<Button disabled>New project</Button>}
      />,
    );
    expect(html).toContain("<h2");
    expect(html).toContain("No projects yet");
    expect(html).toContain("Create one to start.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>New project<\/button>/);
  });

  it("leaves out optional parts", () => {
    const html = renderToStaticMarkup(<EmptyState title="Nothing here" />);
    expect(html).toContain("Nothing here");
    expect(html).not.toContain("<p");
    expect(html).not.toContain("<button");
  });

  it("renders text as text, not HTML", () => {
    const html = renderToStaticMarkup(<EmptyState title="<b>x</b>" />);
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
