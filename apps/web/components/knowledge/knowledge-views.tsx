import type { FormEvent } from "react";
import Link from "next/link";
import { MAX_KNOWLEDGE_TEXT_CHARS, MAX_KNOWLEDGE_TITLE_CHARS, type KnowledgeSourceType, type Plan } from "@askwell/shared";
import { formatCreated } from "../projects/format";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { EmptyState } from "../ui/empty-state";
import { GlassPanel } from "../ui/glass-panel";
import { FILE_ACCEPT, formatSize, limitHint, MAX_FILE_MB, typeLabel, usageText, type StatusLabel } from "./format";

const inputClasses =
  "w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60";

// ---------------------------------------------------------------------------
// Header: usage, add buttons, limit hint
// ---------------------------------------------------------------------------

export type AddMode = "none" | "paste" | "upload";

export function KnowledgeHeader(props: {
  plan: Plan;
  used: number;
  atLimit: boolean;
  mode: AddMode;
  busy: boolean;
  onMode: (mode: AddMode) => void;
}) {
  const { plan, used, atLimit, mode, busy } = props;
  const addDisabled = atLimit || busy;
  return (
    <GlassPanel className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Knowledge</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The bot answers from these. Paste text, or upload a PDF, Markdown or TXT file up to {MAX_FILE_MB} MB.
          </p>
        </div>
        <p className="shrink-0 text-sm font-medium" data-testid="usage">
          {usageText(used, plan)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={mode === "paste" ? "primary" : "secondary"}
          disabled={addDisabled}
          aria-pressed={mode === "paste"}
          onClick={() => props.onMode(mode === "paste" ? "none" : "paste")}
        >
          Paste text
        </Button>
        <Button
          variant={mode === "upload" ? "primary" : "secondary"}
          disabled={addDisabled}
          aria-pressed={mode === "upload"}
          onClick={() => props.onMode(mode === "upload" ? "none" : "upload")}
        >
          Upload file
        </Button>
      </div>
      {atLimit ? (
        <div role="status" className="rounded-md border border-border bg-muted p-3 text-sm">
          <p>{limitHint(plan)}</p>
          {plan === "free" ? (
            <Link href="/dashboard/billing" className="mt-2 inline-block font-medium underline">
              See plans
            </Link>
          ) : null}
        </div>
      ) : null}
    </GlassPanel>
  );
}

function FormError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="rounded-md border border-border bg-muted p-3 text-sm">
      {message}
    </p>
  ) : null;
}

function TitleField(props: { id: string; value: string; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={props.id} className="text-sm font-medium">
        Title
      </label>
      <input
        id={props.id}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        maxLength={MAX_KNOWLEDGE_TITLE_CHARS}
        placeholder="e.g. Refund policy"
        disabled={props.disabled}
        className={cn(inputClasses, "h-10")}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paste form
// ---------------------------------------------------------------------------

export function PasteForm(props: {
  title: string;
  text: string;
  error: string | null;
  pending: boolean;
  onTitle: (v: string) => void;
  onText: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const { title, text, error, pending } = props;
  function submit(event: FormEvent) {
    event.preventDefault();
    props.onSubmit();
  }
  return (
    <GlassPanel className="p-5 sm:p-6">
      <form onSubmit={submit} className="flex flex-col gap-4" aria-label="Paste text">
        <TitleField id="paste-title" value={title} disabled={pending} onChange={props.onTitle} />
        <div className="flex flex-col gap-2">
          <label htmlFor="paste-text" className="text-sm font-medium">
            Text
          </label>
          <textarea
            id="paste-text"
            value={text}
            onChange={(e) => props.onText(e.target.value)}
            maxLength={MAX_KNOWLEDGE_TEXT_CHARS}
            rows={8}
            placeholder="Paste FAQs, policies, product details…"
            disabled={pending}
            className={cn(inputClasses, "min-h-40 py-2")}
          />
          <p className="text-xs text-muted-foreground">
            {text.length.toLocaleString("en")} / {MAX_KNOWLEDGE_TEXT_CHARS.toLocaleString("en")} characters
          </p>
        </div>
        <FormError message={error} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={props.onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add text"}
          </Button>
        </div>
      </form>
    </GlassPanel>
  );
}

// ---------------------------------------------------------------------------
// Upload form
// ---------------------------------------------------------------------------

export function UploadForm(props: {
  title: string;
  file: { name: string; size: number } | null;
  error: string | null;
  pending: boolean;
  onTitle: (v: string) => void;
  onFile: (file: File | null) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const { title, file, error, pending } = props;
  function submit(event: FormEvent) {
    event.preventDefault();
    props.onSubmit();
  }
  return (
    <GlassPanel className="p-5 sm:p-6">
      <form onSubmit={submit} className="flex flex-col gap-4" aria-label="Upload file">
        <div className="flex flex-col gap-2">
          <label htmlFor="upload-file" className="text-sm font-medium">
            File
          </label>
          <input
            id="upload-file"
            type="file"
            accept={FILE_ACCEPT}
            onChange={(e) => props.onFile(e.target.files?.[0] ?? null)}
            disabled={pending}
            className="block w-full text-sm file:mr-3 file:h-10 file:rounded-md file:border file:border-border file:bg-background file:px-4 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted"
          />
          <p className="text-xs text-muted-foreground">
            {file ? `${file.name} · ${formatSize(file.size)}` : `PDF, Markdown or TXT, up to ${MAX_FILE_MB} MB.`}
          </p>
        </div>
        <TitleField id="upload-title" value={title} disabled={pending} onChange={props.onTitle} />
        <FormError message={error} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={props.onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </form>
    </GlassPanel>
  );
}

// ---------------------------------------------------------------------------
// Source list
// ---------------------------------------------------------------------------

/** A row in the list: a source from the server, or an add still in flight in this tab. */
export type SourceItem = {
  key: string;
  /** The source id; null while the add is still being reserved. */
  id: string | null;
  title: string;
  type: KnowledgeSourceType;
  status: StatusLabel;
  createdAt: string | null;
  /** Upload progress 0–1 while the file is being sent. */
  progress?: number;
};

export type RowState = { confirming: boolean; deleting: boolean; error: string | null };

export function SourceList(props: {
  items: SourceItem[];
  rowState: (key: string) => RowState;
  onStartDelete: (item: SourceItem) => void;
  onConfirmDelete: (item: SourceItem) => void;
  onCancelDelete: (item: SourceItem) => void;
}) {
  if (props.items.length === 0) {
    return (
      <EmptyState
        title="No knowledge yet"
        description="Paste text or upload a file. The bot uses it to answer your visitors' questions."
      />
    );
  }
  return (
    <GlassPanel className="overflow-hidden">
      <ul aria-label="Knowledge sources" className="divide-y divide-border">
        {props.items.map((item) => (
          <SourceRow key={item.key} item={item} state={props.rowState(item.key)} {...props} />
        ))}
      </ul>
    </GlassPanel>
  );
}

function SourceRow(props: {
  item: SourceItem;
  state: RowState;
  onStartDelete: (item: SourceItem) => void;
  onConfirmDelete: (item: SourceItem) => void;
  onCancelDelete: (item: SourceItem) => void;
}) {
  const { item, state } = props;
  const created = item.createdAt ? formatCreated(item.createdAt) : null;
  const canDelete = item.id !== null && item.progress === undefined;
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5" data-source-id={item.id ?? undefined}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium" title={item.title}>
          {item.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{typeLabel(item.type)}</span>
          {created ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{created}</span>
            </>
          ) : null}
          <StatusBadge status={item.status} progress={item.progress} />
        </div>
        {item.status === "Failed" ? (
          <p className="mt-2 text-xs text-muted-foreground">
            We couldn&apos;t process this one. Delete it and add it again.
          </p>
        ) : null}
        {state.error ? (
          <p role="alert" className="mt-2 text-xs">
            {state.error}
          </p>
        ) : null}
      </div>
      {canDelete ? (
        state.confirming ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="text-sm">Delete this source?</span>
            <Button variant="primary" className="h-9" disabled={state.deleting} onClick={() => props.onConfirmDelete(item)}>
              {state.deleting ? "Deleting…" : "Delete"}
            </Button>
            <Button variant="ghost" className="h-9" disabled={state.deleting} onClick={() => props.onCancelDelete(item)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="h-9 shrink-0 self-start sm:self-auto"
            aria-label={`Delete ${item.title}`}
            onClick={() => props.onStartDelete(item)}
          >
            Delete
          </Button>
        )
      ) : null}
    </li>
  );
}

export function StatusBadge({ status, progress }: { status: StatusLabel; progress?: number }) {
  const text = progress !== undefined ? `Uploading ${Math.round(progress * 100)}%` : status;
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium",
        status === "Ready" && "border-foreground/30 text-foreground",
        status === "Processing" && "border-border text-muted-foreground",
        status === "Failed" && "border-foreground bg-foreground text-background",
      )}
    >
      {status === "Processing" ? (
        <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-muted-foreground" />
      ) : null}
      {text}
    </span>
  );
}
