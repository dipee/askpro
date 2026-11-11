import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { APP_NAME } from "@askwell/shared";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: `Projects · ${APP_NAME}` };

// Phase 2 wires "New project" and lists projects here.
export default async function ProjectsPage() {
  await auth.protect();
  return (
    <>
      <PageHeader title="Projects" description="Each project is one chat widget for one website." />
      <EmptyState
        title="No projects yet"
        description="Create a project to add your knowledge and get the embed code for your site."
        action={
          <Button disabled title="Coming soon">
            New project
          </Button>
        }
      />
    </>
  );
}
