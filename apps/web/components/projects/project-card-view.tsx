import type { FormEvent } from "react";
import Link from "next/link";
import { MAX_PROJECT_NAME_CHARS, type Plan, type Project } from "@askwell/shared";
import { Button } from "../ui/button";
import { GlassPanel } from "../ui/glass-panel";
import { formatCreated, truncateKey, usageLabel } from "./format";

export type CardMode = "view" | "rename" | "confirm-delete";

export type ProjectCardViewProps = {
  project: Project;
  plan: Plan;
  mode: CardMode;
  draftName: string;
  error: string | null;
  pending: boolean;
  onStartRename: () => void;
  onDraftChange: (name: string) => void;
  onSaveRename: () => void;
  onStartDelete: () => void;
  onConfirmDelete: () => void;
  onCancel: () => void;
};

/** One project in the list. Rename and delete happen inside the card. */
export function ProjectCardView(props: ProjectCardViewProps) {
  const { project, plan, mode, draftName, error, pending } = props;
  const href = `/dashboard/projects/${project.id}`;

  function submitRename(event: FormEvent) {
    event.preventDefault();
    props.onSaveRename();
  }

  return (
    <GlassPanel className="flex min-w-0 flex-col gap-4 p-5" data-project-id={project.id}>
      {mode === "rename" ? (
        <form onSubmit={submitRename} className="flex flex-col gap-2">
          <label htmlFor={`rename-${project.id}`} className="text-sm font-medium">
            Project name
          </label>
          <input
            id={`rename-${project.id}`}
            value={draftName}
            onChange={(e) => props.onDraftChange(e.target.value)}
            maxLength={MAX_PROJECT_NAME_CHARS}
            required
            autoFocus
            disabled={pending}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending || draftName.trim() === ""}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" onClick={props.onCancel} disabled={pending}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="min-w-0">
          <Link href={href} className="block truncate text-base font-semibold tracking-tight hover:underline">
            {project.name}
          </Link>
          <p className="mt-1 font-mono text-xs text-muted-foreground" title={project.publicKey}>
            {truncateKey(project.publicKey)}
          </p>
        </div>
      )}

      <dl className="grid gap-1 text-sm">
        <div>
          <dt className="sr-only">Messages</dt>
          <dd>{usageLabel(project.messagesUsed, plan)}</dd>
        </div>
        <div className="text-muted-foreground">
          <dt className="inline">Created </dt>
          <dd className="inline">{formatCreated(project.createdAt)}</dd>
        </div>
      </dl>

      {mode === "confirm-delete" ? (
        <div role="alertdialog" aria-label="Confirm delete" className="flex flex-col gap-3 rounded-md border border-border bg-background/70 p-3">
          <p className="text-sm">
            Delete <span className="font-semibold">{project.name}</span>? Its knowledge, conversations and widget are
            removed too. This can&apos;t be undone.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={props.onConfirmDelete} disabled={pending}>
              {pending ? "Deleting…" : "Delete project"}
            </Button>
            <Button variant="ghost" onClick={props.onCancel} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "view" ? (
        <div className="flex flex-wrap gap-2">
          <Link
            href={href}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-gray-800"
          >
            Open
          </Link>
          <Button variant="secondary" onClick={props.onStartRename}>
            Rename
          </Button>
          <Button variant="ghost" onClick={props.onStartDelete}>
            Delete
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-foreground">
          {error}
        </p>
      ) : null}
    </GlassPanel>
  );
}
