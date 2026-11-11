"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function DashboardError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      description="This page didn't load. Try again, or reload if it keeps happening."
      action={<Button onClick={() => retry()}>Try again</Button>}
    />
  );
}
