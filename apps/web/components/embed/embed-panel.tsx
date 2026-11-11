"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { EMBED_MESSAGE_TYPES, type WidgetConfig } from "@askwell/shared";
import { Spinner } from "@/components/ui/spinner";
import { ChatUnavailable } from "./chat-unavailable";
import { chatReducer, initialChatState, MOCK_REPLY, MOCK_REPLY_DELAY_MS, newMessageId } from "./chat-state";
import { ChatView } from "./chat-view";
import { loadWidgetConfig } from "./load-config";
import { createParentMessageHandler, postToParent } from "./parent-messaging";
import { getVisitorId } from "./visitor-id";

type ConfigState = { status: "loading" } | { status: "ready"; config: WidgetConfig } | { status: "unavailable" };


/** The chat panel inside the widget iframe. */
export function EmbedPanel({ publicKey, parentOrigin }: { publicKey: string; parentOrigin: string | null }) {
  const [configState, setConfigState] = useState<ConfigState>({ status: "loading" });
  const [chat, dispatch] = useReducer(chatReducer, initialChatState);
  const [draft, setDraft] = useState("");
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    loadWidgetConfig(publicKey).then((config) => {
      if (active) setConfigState(config ? { status: "ready", config } : { status: "unavailable" });
    });
    return () => {
      active = false;
    };
  }, [publicKey]);

  useEffect(() => {
    // Phase 3 sends this with each chat request.
    getVisitorId(() => window.localStorage);
  }, []);

  useEffect(() => {
    // Only the host page's origin may talk to the panel. No loader → panel
    // messages are defined yet; anything else is ignored.
    const handler = createParentMessageHandler(parentOrigin, () => {});
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [parentOrigin]);

  useEffect(() => () => {
    if (replyTimer.current) clearTimeout(replyTimer.current);
  }, []);

  const close = useCallback(() => {
    const parent = window.parent !== window ? window.parent : null;
    postToParent(parent, parentOrigin, { type: EMBED_MESSAGE_TYPES.close });
  }, [parentOrigin]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const send = () => {
    const text = draft.trim();
    if (!text || chat.typing) return;
    dispatch({ type: "send", id: newMessageId(), text });
    setDraft("");
    replyTimer.current = setTimeout(() => {
      dispatch({ type: "reply", id: newMessageId(), text: MOCK_REPLY });
    }, MOCK_REPLY_DELAY_MS);
  };

  if (configState.status === "loading") {
    return (
      <div className="flex h-dvh items-center justify-center bg-white/80">
        <Spinner label="Loading chat" />
      </div>
    );
  }
  if (configState.status === "unavailable") return <ChatUnavailable />;

  return (
    <ChatView
      headerText={configState.config.headerText}
      showBadge={configState.config.showBadge}
      messages={chat.messages}
      typing={chat.typing}
      draft={draft}
      onDraftChange={setDraft}
      onSend={send}
      onClose={close}
    />
  );
}
