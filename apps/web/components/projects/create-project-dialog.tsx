"use client";

import { useEffect, useRef, type FormEvent } from "react";
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

  const ref = useRef<HTMLDialogElement>(null);

  // showModal() makes the rest of the page inert: Tab stays in the dialog and
  // Escape fires "cancel". The trigger restores focus on close.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="new-project-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
      className="mx-auto mb-4 mt-auto w-[calc(100%-2rem)] max-w-md bg-transparent p-0 backdrop:bg-black/30 sm:my-auto"
    >
      <GlassPanel className="bg-white/90 p-6">
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
    </dialog>
  );
}
