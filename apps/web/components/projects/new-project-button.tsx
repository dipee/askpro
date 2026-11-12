"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Plan } from "@askwell/shared";
import { Button } from "../ui/button";
import { createProject } from "./api";
import { CreateProjectDialog, type CreateError } from "./create-project-dialog";
import { planLimitMessage } from "./format";

/** "New project" button that opens the create dialog, then goes to the new project's page. */
export function NewProjectButton({ plan, variant = "primary" }: { plan: Plan; variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<CreateError | null>(null);
  const [pending, setPending] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Give focus back to the trigger once the dialog is gone. Doing it inside close()
  // would be ignored: while the modal is open the rest of the page is inert.
  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  function close() {
    setOpen(false);
    setName("");
    setError(null);
  }

  async function submit() {
    setPending(true);
    setError(null);
    const result = await createProject(name.trim());
    if (result.ok) {
      router.push(`/dashboard/projects/${result.data.id}`);
      router.refresh();
      return;
    }
    setPending(false);
    setError(
      result.code === "plan_limit"
        ? { message: planLimitMessage(plan, result.message), planLimit: true }
        : { message: result.message, planLimit: false },
    );
  }

  return (
    <>
      <Button ref={triggerRef} variant={variant} onClick={() => setOpen(true)}>
        New project
      </Button>
      {open ? (
        <CreateProjectDialog
          name={name}
          error={error}
          pending={pending}
          onNameChange={(value) => {
            setName(value);
            if (error && !error.planLimit) setError(null);
          }}
          onSubmit={submit}
          onClose={close}
        />
      ) : null}
    </>
  );
}
