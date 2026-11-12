"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@askwell/shared";
import type { Usage } from "../../lib/usage";
import { deleteProject, renameProject } from "./api";
import { ProjectCardView, type CardMode, type ReturnFocus } from "./project-card-view";

/** A project card with in-page rename and delete. Refreshes the list after each. */
export function ProjectCard({ project, usage }: { project: Project; usage: Usage }) {
  const router = useRouter();
  const [mode, setMode] = useState<CardMode>("view");
  const [draftName, setDraftName] = useState(project.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [returnFocus, setReturnFocus] = useState<ReturnFocus>(null);

  function reset() {
    // Back to view: put focus on the button that opened the step we're leaving.
    setReturnFocus(mode === "confirm-delete" ? "delete" : mode === "rename" ? "rename" : null);
    setMode("view");
    setDraftName(project.name);
    setError(null);
  }

  async function saveRename() {
    const name = draftName.trim();
    if (name === project.name) return reset();
    setPending(true);
    const result = await renameProject(project.id, name);
    setPending(false);
    if (!result.ok) return setError(result.message);
    reset();
    router.refresh();
  }

  async function confirmDelete() {
    setPending(true);
    const result = await deleteProject(project.id);
    if (!result.ok) {
      setPending(false);
      return setError(result.message);
    }
    router.refresh();
  }

  return (
    <ProjectCardView
      project={project}
      usage={usage}
      mode={mode}
      returnFocus={returnFocus}
      draftName={draftName}
      error={error}
      pending={pending}
      onStartRename={() => {
        setError(null);
        setDraftName(project.name);
        setMode("rename");
      }}
      onDraftChange={setDraftName}
      onSaveRename={saveRename}
      onStartDelete={() => {
        setError(null);
        setMode("confirm-delete");
      }}
      onConfirmDelete={confirmDelete}
      onCancel={reset}
    />
  );
}
