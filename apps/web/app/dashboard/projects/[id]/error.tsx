"use client";

import { useEffect } from "react";
import { Button } from "../../../../components/ui/button";
import { ErrorState } from "../../../../components/ui/error-state";

export default function ProjectError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title="We couldn't load this project"
      description="Try again, or go back to your projects."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => retry()}>Try again</Button>
          <a
            href="/dashboard"
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-muted"
          >
            Projects
          </a>
        </div>
      }
    />
  );
}
