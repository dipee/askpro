"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Plan, Project } from "@askwell/shared";
import { deleteProject, renameProject } from "./api";
import { ProjectCardView, type CardMode } from "./project-card-view";

/** A project card with in-page rename and delete. Refreshes the list after each. */
export function ProjectCard({ project, plan }: { project: Project; plan: Plan }) {
  const router = useRouter();
  const [mode, setMode] = useState<CardMode>("view");
  const [draftName, setDraftName] = useState(project.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function reset() {
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
      plan={plan}
      mode={mode}
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
