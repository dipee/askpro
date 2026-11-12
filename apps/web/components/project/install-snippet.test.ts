import { describe, expect, it } from "vitest";
import { installSnippet } from "./install-snippet";

describe("installSnippet", () => {
  it("points at the app's widget.js with the project's key, async", () => {
    expect(installSnippet("https://askpro-git-x.vercel.app", "pk_2cfb1e931e564ee2a9095893478c1a0f")).toBe(
      '<script src="https://askpro-git-x.vercel.app/widget.js" data-key="pk_2cfb1e931e564ee2a9095893478c1a0f" async></script>',
    );
  });
});
