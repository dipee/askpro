import { APP_NAME, MAX_CHAT_MESSAGE_CHARS } from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ChatMessage } from "./chat-state";
import { ChatView, isNearBottom, NEAR_BOTTOM_PX, remainingNotice, shouldAutoScroll } from "./chat-view";

const noop = () => {};
function render(props: Partial<Parameters<typeof ChatView>[0]> = {}) {
  return renderToStaticMarkup(
    <ChatView
      headerText="How can we help?"
      showBadge
      messages={[]}
      typing={false}
      draft=""
      onDraftChange={noop}
      onSend={noop}
      onClose={noop}
      {...props}
    />,
  );
}

describe("ChatView", () => {
  it("shows the header text and a close button", () => {
    const html = render({ headerText: "Ask Acme" });
    expect(html).toContain(">Ask Acme</h1>");
    expect(html).toContain('aria-label="Close chat"');
  });

  it("renders messages as text, never HTML", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "visitor", text: "<b>x</b>" },
      { id: "2", role: "bot", text: '<img src=x onerror="alert(1)">' },
    ];
    const html = render({ messages, headerText: "<i>h</i>" });
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("&lt;i&gt;h&lt;/i&gt;");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<img");
  });

  it("shows the typing state only while typing", () => {
    expect(render({ typing: true })).toContain('data-testid="typing"');
    expect(render({ typing: false })).not.toContain('data-testid="typing"');
  });

  it("shows the badge only when showBadge is true", () => {
    expect(render({ showBadge: true })).toContain(`Powered by <a`);
    expect(render({ showBadge: true })).toContain(`>${APP_NAME}</a>`);
    expect(render({ showBadge: false })).not.toContain("Powered by");
  });

  it("limits input to MAX_CHAT_MESSAGE_CHARS", () => {
    expect(render()).toContain(`maxLength="${MAX_CHAT_MESSAGE_CHARS}"`);
  });

  it("disables send for an empty draft or while typing", () => {
    expect(render({ draft: "" })).toMatch(/<button type="submit" disabled=""/);
    expect(render({ draft: "hi", typing: true })).toMatch(/<button type="submit" disabled=""/);
    expect(render({ draft: "hi" })).not.toMatch(/<button type="submit" disabled=""/);
  });
});

describe("remaining-characters notice", () => {
  it("is a persistent polite status region, empty until the last 100 characters", () => {
    const far = render({ draft: "hi" });
    expect(far).toMatch(/<p role="status" aria-live="polite"[^>]*><\/p>/);
    const near = render({ draft: "x".repeat(MAX_CHAT_MESSAGE_CHARS - 40) });
    expect(near).toMatch(/<p role="status" aria-live="polite"[^>]*>40 characters left<\/p>/);
  });

  it("remainingNotice counts down from 100", () => {
    expect(remainingNotice(0)).toBe("");
    expect(remainingNotice(MAX_CHAT_MESSAGE_CHARS - 101)).toBe("");
    expect(remainingNotice(MAX_CHAT_MESSAGE_CHARS - 100)).toBe("100 characters left");
    expect(remainingNotice(MAX_CHAT_MESSAGE_CHARS)).toBe("0 characters left");
  });
});

describe("auto-scroll", () => {
  it("isNearBottom allows a small threshold", () => {
    expect(isNearBottom({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 })).toBe(true);
    expect(isNearBottom({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 - NEAR_BOTTOM_PX })).toBe(true);
    expect(isNearBottom({ scrollHeight: 1000, clientHeight: 400, scrollTop: 300 })).toBe(false);
  });

  it("scrolls after the visitor sends, and for replies only when near the bottom", () => {
    expect(shouldAutoScroll(false, "visitor")).toBe(true);
    expect(shouldAutoScroll(true, "bot")).toBe(true);
    expect(shouldAutoScroll(false, "bot")).toBe(false);
  });

  it("shows an error notice as text, never HTML", () => {
    const html = render({ error: "<b>That message can't be answered.</b>" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("&lt;b&gt;That message can&#x27;t be answered.&lt;/b&gt;");
    expect(html).not.toContain("<b>");
  });

  it("renders messages as text, never HTML", () => {
    const html = render({ messages: [{ id: "1", role: "bot", text: "<img src=x onerror=alert(1)>" }] });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("disables send for an over-long draft", () => {
    const html = render({ draft: "x".repeat(MAX_CHAT_MESSAGE_CHARS + 1) });
    expect(html).toMatch(/<button type="submit" disabled=""/);
  });
});
