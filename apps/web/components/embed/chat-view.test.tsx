import { APP_NAME, MAX_CHAT_MESSAGE_CHARS } from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ChatMessage } from "./chat-state";
import { ChatView } from "./chat-view";

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
