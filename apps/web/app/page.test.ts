import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { APP_NAME } from "@askwell/shared";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("home page", () => {
  it("renders APP_NAME", () => {
    const html = renderToStaticMarkup(createElement(Home));
    expect(html).toContain(APP_NAME);
  });
});
