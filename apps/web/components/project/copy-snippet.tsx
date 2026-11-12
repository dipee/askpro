"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { Button } from "../ui/button";

type CopyState = "idle" | "copied" | "manual";

/** The snippet in a code block with a Copy button. Falls back to selecting the text. */
export function CopySnippet({ snippet }: { snippet: string }) {
  const codeRef = useRef<HTMLElement>(null);
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state !== "copied") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  function selectSnippet() {
    const code = codeRef.current;
    const selection = window.getSelection();
    if (!code || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(code);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setState("copied");
    } catch {
      // No clipboard access (permissions, insecure context): select it for the owner.
      selectSnippet();
      setState("manual");
    }
  }

  return <CopySnippetView snippet={snippet} state={state} codeRef={codeRef} onCopy={copy} />;
}

/** Presentational part, rendered on its own in tests. */
export function CopySnippetView({
  snippet,
  state,
  codeRef,
  onCopy,
}: {
  snippet: string;
  state: CopyState;
  codeRef?: Ref<HTMLElement>;
  onCopy: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <pre className="overflow-x-auto rounded-md border border-border bg-gray-950 p-4 text-sm leading-relaxed text-gray-50">
        <code ref={codeRef} className="select-all whitespace-pre-wrap break-all">
          {snippet}
        </code>
      </pre>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onCopy}>{state === "copied" ? "Copied" : "Copy snippet"}</Button>
        <span aria-live="polite" className="text-sm text-muted-foreground">
          {state === "copied" ? "Copied to your clipboard." : null}
          {state === "manual" ? "Selected. Press Ctrl+C (⌘C on Mac) to copy." : null}
        </span>
      </div>
    </div>
  );
}
