import type { FormEvent } from "react";
import Link from "next/link";
import { MAX_PROJECT_NAME_CHARS } from "@askwell/shared";
import { Button } from "../ui/button";
import { GlassPanel } from "../ui/glass-panel";

export type CreateError = { message: string; planLimit: boolean };

export type CreateProjectDialogProps = {
  name: string;
  error: CreateError | null;
  pending: boolean;
  onNameChange: (name: string) => void;
  onSubmit: () => void;
  onClose: () => void;
};

/** Modal form to name a new project. At the plan limit it links to billing. */
export function CreateProjectDialog({ name, error, pending, onNameChange, onSubmit, onClose }: CreateProjectDialogProps) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !pending) onClose();
      }}
    >
      <GlassPanel
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        className="w-full max-w-md bg-white/90 p-6"
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <h2 id="new-project-title" className="text-lg font-semibold tracking-tight">
              New project
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">One project is one chat widget for one website.</p>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="new-project-name" className="text-sm font-medium">
              Name
            </label>
            <input
              id="new-project-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              maxLength={MAX_PROJECT_NAME_CHARS}
              placeholder="e.g. Help desk"
              required
              autoFocus
              disabled={pending}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
            />
          </div>

          {error ? (
            <div role="alert" className="rounded-md border border-border bg-muted p-3 text-sm">
              <p>{error.message}</p>
              {error.planLimit ? (
                <Link href="/dashboard/billing" className="mt-2 inline-block font-medium underline">
                  See plans
                </Link>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || name.trim() === "" || error?.planLimit === true}>
              {pending ? "Creating…" : "Create project"}
            </Button>
          </div>
        </form>
      </GlassPanel>
    </div>
  );
}
