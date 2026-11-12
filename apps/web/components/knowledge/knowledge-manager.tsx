"use client";

import { useEffect, useState } from "react";
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
export type Pending = {
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
 * The rows to show, and how many sources count toward the limit. Pure.
 *
 * - An active add (not finished) always shows as its own row, with its upload progress,
 *   and hides the server row for the same id (a poll can list the reservation while
 *   the file is still uploading).
 * - A finished add stays until a newer server list arrives, which either lists the
 *   source or no longer has it (e.g. a refused file). Then the server row wins.
 */
export function listItems(
  sources: KnowledgeSource[],
  pending: Pending[],
  deleted: ReadonlySet<string>,
): { items: SourceItem[]; used: number } {
  const active = pending.filter((p) => !p.doneWith);
  const activeIds = new Set(active.flatMap((p) => (p.id ? [p.id] : [])));
  const server = sources.filter((s) => !deleted.has(s.id) && !activeIds.has(s.id));
  const listed = new Set(server.map((s) => s.id));
  const finished = pending.filter((p) => p.doneWith === sources && p.id !== null && !listed.has(p.id));
  const local = [...active, ...finished];
  const items: SourceItem[] = [
    ...local.map((p) => ({
      key: p.key,
      id: p.id,
      title: p.title,
      type: p.type,
      status: "Processing" as const,
      createdAt: null,
      progress: p.progress,
    })),
    ...server.map((s) => ({ key: s.id, id: s.id, title: s.title, type: s.type, status: statusLabel(s.status), createdAt: s.createdAt })),
  ];
  return { items, used: items.length };
}

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
  /** The upload title came from the file name (not typed), so a new file may replace it. */
  const [titleFromFile, setTitleFromFile] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [deleted, setDeleted] = useState<Set<string>>(new Set());

  const busy = pending.some((p) => !p.doneWith);
  const { items, used } = listItems(sources, pending, deleted);
  const atLimit = used >= sourceLimit(plan);

  // Refresh while any source the server knows about is still settling, up to MAX_POLL_MS
  // (an abandoned upload stays `uploading` until the 2-hour reclaim).
  const settling = sources.some((s) => !deleted.has(s.id) && isSettling(s.status));
  useEffect(() => {
    if (!settling) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > MAX_POLL_MS) clearInterval(timer);
      else router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [settling, router]);

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
    settle(key, result.data.id);
    if (result.data.status === "failed") {
      // Saved but not processed: keep the draft so the owner can retry after deleting it.
      return setFormError("We couldn't process this text. Delete the failed source below, then try again: your text is still here.");
    }
    setPasteTitle("");
    setPasteBody("");
    setMode("none");
  }

  function pickFile(next: File | null) {
    setFile(next);
    setFormError(null);
    if (!next) return;
    const check = checkFile(next);
    if (!check.ok) return setFormError(check.message);
    if (uploadTitle.trim() === "" || titleFromFile) {
      setUploadTitle(titleFromFileName(next.name));
      setTitleFromFile(true);
    }
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
      const freed = await deleteSource(sourceId);
      drop(key);
      if (!freed.ok && freed.code !== "not_found") {
        // It still holds a slot: refresh so it shows in the list, where it can be deleted.
        router.refresh();
        return setFormError(`${sent.message} Its slot couldn't be freed: delete it from the list below.`);
      }
      return setFormError(sent.message);
    }

    setUploadTitle("");
    setTitleFromFile(false);
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
    if (done.data.status === "failed") {
      setFormError("We couldn't process this file. Delete the failed source below, then upload it again.");
    }
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
          onTitle={(v) => {
            setPasteTitle(v);
            setFormError(null);
          }}
          onText={(v) => {
            setPasteBody(v);
            setFormError(null);
          }}
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
          onTitle={(v) => {
            setUploadTitle(v);
            setTitleFromFile(false);
            setFormError(null);
          }}
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
