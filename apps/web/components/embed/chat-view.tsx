"use client";

import { useLayoutEffect, useRef, type FormEvent } from "react";
import { APP_NAME, MAX_CHAT_MESSAGE_CHARS } from "@askwell/shared";
import type { ChatMessage } from "./chat-state";

/** How close to the bottom (px) still counts as "at the bottom". */
export const NEAR_BOTTOM_PX = 48;

/** True when the list is scrolled to (or near) its bottom. */
export function isNearBottom(el: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
}

/**
 * Whether new content should scroll the list to the bottom: always after the
 * visitor sends, otherwise only if they were already near the bottom (so we
 * don't yank them away from earlier messages they scrolled up to read).
 */
export function shouldAutoScroll(wasNearBottom: boolean, lastRole: ChatMessage["role"] | undefined): boolean {
  return lastRole === "visitor" || wasNearBottom;
}

/** Text for the remaining-characters notice, or "" while far from the limit. */
export function remainingNotice(draftLength: number): string {
  const remaining = MAX_CHAT_MESSAGE_CHARS - draftLength;
  return remaining <= 100 ? `${remaining} characters left` : "";
}

type ChatViewProps = {
  headerText: string;
  showBadge: boolean;
  messages: ChatMessage[];
  typing: boolean;
  /** Friendly notice for the last failed send, or null. */
  error?: string | null;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onClose: () => void;
};

/**
 * The panel UI. Pure: state comes in as props. Every message renders as a
 * React text node, never HTML (project.md §9 XSS).
 */
export function ChatView({
  headerText,
  showBadge,
  messages,
  typing,
  error = null,
  draft,
  onDraftChange,
  onSend,
  onClose,
}: ChatViewProps) {
  const canSend = draft.trim().length > 0 && draft.length <= MAX_CHAT_MESSAGE_CHARS && !typing;
  const listRef = useRef<HTMLOListElement>(null);
  const nearBottom = useRef(true);
  const lastRole = messages.at(-1)?.role;

  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && shouldAutoScroll(nearBottom.current, lastRole)) {
      list.scrollTop = list.scrollHeight;
      nearBottom.current = true;
    }
  }, [messages.length, typing, lastRole]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canSend) onSend();
  };
  const notice = remainingNotice(draft.length);

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-white/80 text-foreground backdrop-blur-glass">
      <header className="flex items-center justify-between gap-3 border-b border-glass-border px-4 py-3">
        <h1 className="truncate text-sm font-semibold">{headerText}</h1>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-black/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <ol
        ref={listRef}
        onScroll={(e) => {
          nearBottom.current = isNearBottom(e.currentTarget);
        }}
        aria-live="polite"
        aria-label="Messages"
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4 text-sm">
        {messages.length === 0 ? (
          <li className="m-auto max-w-[16rem] text-center text-muted-foreground">
            Ask a question and we&apos;ll answer here.
          </li>
        ) : null}
        {messages.map((m) => (
          <li
            key={m.id}
            data-role={m.role}
            className={
              m.role === "visitor"
                ? "max-w-[85%] self-end rounded-2xl rounded-br-sm bg-primary px-3 py-2 break-words whitespace-pre-wrap text-primary-foreground"
                : "max-w-[85%] self-start rounded-2xl rounded-bl-sm border border-glass-border bg-white px-3 py-2 break-words whitespace-pre-wrap shadow-sm"
            }
          >
            {m.text}
          </li>
        ))}
        {typing ? (
          <li data-testid="typing" className="self-start rounded-2xl rounded-bl-sm border border-glass-border bg-white px-3 py-2.5 shadow-sm">
            <span className="sr-only">Typing…</span>
            <span aria-hidden="true" className="flex gap-1">
              <span className="size-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s] motion-reduce:animate-none" />
              <span className="size-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s] motion-reduce:animate-none" />
              <span className="size-1.5 animate-bounce rounded-full bg-gray-400 motion-reduce:animate-none" />
            </span>
          </li>
        ) : null}
      </ol>

      <form onSubmit={submit} className="border-t border-glass-border p-3">
        {/* Always mounted so screen readers announce a new error. Text only, never HTML. */}
        <p role="alert" className="mb-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground empty:hidden">
          {error}
        </p>
        <div className="flex items-center gap-2">
          <label htmlFor="embed-input" className="sr-only">
            Message
          </label>
          <input
            id="embed-input"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            maxLength={MAX_CHAT_MESSAGE_CHARS}
            autoComplete="off"
            placeholder="Type a message…"
            className="h-10 min-w-0 flex-1 rounded-full border border-border bg-white px-4 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-gray-400"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
        {/* Always mounted so screen readers announce changes politely. */}
        <p role="status" aria-live="polite" className="px-4 text-right text-[11px] text-muted-foreground empty:hidden">
          {notice}
        </p>
        {showBadge ? (
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Powered by{" "}
            <a href="/" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:underline">
              {APP_NAME}
            </a>
          </p>
        ) : null}
      </form>
    </div>
  );
}
