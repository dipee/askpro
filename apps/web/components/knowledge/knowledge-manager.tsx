"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { KnowledgeSource, KnowledgeSourceType, Plan } from "@askwell/shared";
import { deleteSource, finalizeUpload, pasteText, putFile, requestUpload } from "./api";
import { checkFile, isSettling, pasteError, sourceLimit, statusLabel, titleFromFileName, uploadError } from "./format";
import {
  KnowledgeHeader,
  PasteForm,
  SourceList,
  UploadForm,
  type AddMode,
  type RowState,
  type SourceItem,
} from "./knowledge-views";

/** How often the list refreshes while a source is processing, and for how long at most. */
export const POLL_MS = 3000;
export const MAX_POLL_MS = 5 * 60 * 1000;

/** An add still in flight in this tab, shown as a row until the server list has it. */
type Pending = {
  key: string;
  id: string | null;
  title: string;
  type: KnowledgeSourceType;
  progress?: number;
  /**
   * Set when the add finished: the server list at that moment. The row stays until a
   * newer list arrives (router.refresh), so it doesn't flicker out and back in.
   */
  doneWith?: KnowledgeSource[];
};

const IDLE: RowState = { confirming: false, deleting: false, error: null };

/**
 * The Knowledge page's state: the add forms, in-flight adds, deletes, and refreshing the
 * server-rendered list (router.refresh) until every source has settled.
 */
export function KnowledgeManager({ projectId, plan, sources }: { projectId: string; plan: Plan; sources: KnowledgeSource[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<AddMode>("none");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteBody, setPasteBody] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [deleted, setDeleted] = useState<Set<string>>(new Set());

  const busy = pending.some((p) => !p.doneWith);
  const visible = useMemo(() => sources.filter((s) => !deleted.has(s.id)), [sources, deleted]);
  const known = useMemo(() => new Set(visible.map((s) => s.id)), [visible]);
  // A finished add is replaced by any newer server list: it either lists the source or
  // the source is gone. Stale entries are pruned on the next add.
  const inFlight = pending.filter((p) => (p.doneWith ? p.doneWith === sources : true) && (p.id === null || !known.has(p.id)));
  const used = visible.length + inFlight.length;
  const atLimit = used >= sourceLimit(plan);

  // Refresh while any source the server knows about is still settling, up to MAX_POLL_MS
  // (an abandoned upload stays `uploading` until the 2-hour reclaim).
  const settling = visible.some((s) => isSettling(s.status));
  useEffect(() => {
    if (!settling) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > MAX_POLL_MS) clearInterval(timer);
      else router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [settling, router]);

  const items: SourceItem[] = [
    ...inFlight.map((p) => ({
      key: p.key,
      id: p.id,
      title: p.title,
      type: p.type,
      status: "Processing" as const,
      createdAt: null,
      progress: p.progress,
    })),
    ...visible.map((s) => ({ key: s.id, id: s.id, title: s.title, type: s.type, status: statusLabel(s.status), createdAt: s.createdAt })),
  ];

  function openMode(next: AddMode) {
    setMode(next);
    setFormError(null);
  }

  function track(p: Pending) {
    setPending((list) => [p, ...list.filter((q) => !q.doneWith || q.doneWith === sources)]);
  }
  function update(key: string, patch: Partial<Pending>) {
    setPending((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }
  function drop(key: string) {
    setPending((list) => list.filter((p) => p.key !== key));
  }
  /** The add finished: refresh the list; the row stays until the new list arrives. */
  function settle(key: string, id: string) {
    update(key, { id, progress: undefined, doneWith: sources });
    router.refresh();
  }

  async function submitPaste() {
    const error = pasteError(pasteTitle, pasteBody);
    if (error) return setFormError(error);
    const key = `paste-${Date.now()}`;
    const title = pasteTitle.trim();
    track({ key, id: null, title, type: "text" });
    setFormError(null);
    const result = await pasteText(projectId, title, pasteBody);
    if (!result.ok) {
      drop(key);
      return setFormError(result.message);
    }
    setPasteTitle("");
    setPasteBody("");
    setMode("none");
    settle(key, result.data.id);
  }

  function pickFile(next: File | null) {
    setFile(next);
    setFormError(null);
    if (!next) return;
    const check = checkFile(next);
    if (!check.ok) return setFormError(check.message);
    if (uploadTitle.trim() === "") setUploadTitle(titleFromFileName(next.name));
  }

  async function submitUpload() {
    const error = uploadError(uploadTitle, file);
    const check = file ? checkFile(file) : null;
    if (error || !file || !check?.ok) return setFormError(error ?? "Choose a file.");
    const key = `upload-${Date.now()}`;
    const title = uploadTitle.trim();
    track({ key, id: null, title, type: check.ext, progress: 0 });
    setFormError(null);

    const reserved = await requestUpload(projectId, title, file);
    if (!reserved.ok) {
      drop(key);
      return setFormError(reserved.message);
    }
    const sourceId = reserved.data.source.id;
    update(key, { id: sourceId });

    const sent = await putFile(reserved.data.uploadUrl, file, check.ext, (progress) => update(key, { progress }));
    if (!sent.ok) {
      // Free the reservation so it doesn't count toward the limit.
      await deleteSource(sourceId);
      drop(key);
      return setFormError(sent.message);
    }

    setUploadTitle("");
    setFile(null);
    setMode("none");
    update(key, { progress: undefined });
    const done = await finalizeUpload(projectId, sourceId);
    if (!done.ok) {
      // Refused (e.g. not a valid PDF): the server deleted it. Show why.
      setFormError(done.message);
      drop(key);
      router.refresh();
      return;
    }
    settle(key, sourceId);
  }

  const rowState = (key: string) => rows[key] ?? IDLE;
  const setRow = (key: string, state: RowState) => setRows((r) => ({ ...r, [key]: state }));

  async function confirmDelete(item: SourceItem) {
    if (!item.id) return;
    const id = item.id;
    setRow(item.key, { confirming: true, deleting: true, error: null });
    const result = await deleteSource(id);
    if (!result.ok && result.code !== "not_found") {
      return setRow(item.key, { confirming: true, deleting: false, error: result.message });
    }
    setDeleted((d) => new Set(d).add(id));
    setRow(item.key, IDLE);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <KnowledgeHeader plan={plan} used={used} atLimit={atLimit} mode={mode} busy={busy} onMode={openMode} />
      {/* A refusal from finalize (e.g. not a valid PDF) arrives after the form closed. */}
      {mode === "none" && formError ? (
        <p role="alert" className="rounded-md border border-border bg-muted p-3 text-sm">
          {formError}
        </p>
      ) : null}
      {mode === "paste" ? (
        <PasteForm
          title={pasteTitle}
          text={pasteBody}
          error={formError}
          pending={busy}
          onTitle={setPasteTitle}
          onText={setPasteBody}
          onSubmit={submitPaste}
          onCancel={() => openMode("none")}
        />
      ) : null}
      {mode === "upload" ? (
        <UploadForm
          title={uploadTitle}
          file={file}
          error={formError}
          pending={busy}
          onTitle={setUploadTitle}
          onFile={pickFile}
          onSubmit={submitUpload}
          onCancel={() => openMode("none")}
        />
      ) : null}
      <SourceList
        items={items}
        rowState={rowState}
        onStartDelete={(item) => setRow(item.key, { confirming: true, deleting: false, error: null })}
        onConfirmDelete={confirmDelete}
        onCancelDelete={(item) => setRow(item.key, IDLE)}
      />
    </div>
  );
}
