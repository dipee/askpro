import { Suspense } from "react";
import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { APP_NAME, type Plan, type Project } from "@askwell/shared";
import { PageHeader } from "@/components/dashboard/page-header";
import { NewProjectButton } from "@/components/projects/new-project-button";
import { ProjectList } from "@/components/projects/project-list";
import { ProjectsSkeleton } from "@/components/projects/projects-skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { ensureAccount } from "@/lib/accounts";
import { PROJECT_COLUMNS, projectFromRow } from "@/lib/projects";
import { createOwnerClient } from "@/lib/supabase/owner";

export const metadata: Metadata = { title: `Projects · ${APP_NAME}` };

type Loaded = { ok: true; plan: Plan; projects: Project[] } | { ok: false };

/** The owner's plan and projects, newest first. Owner client: RLS scopes the read. */
async function loadProjects(): Promise<Loaded> {
  try {
    const { plan } = await ensureAccount();
    // A fresh AbortSignal opts out of Next.js fetch memoization (as lib/accounts does),
    // so router.refresh() after a rename or delete always gets the current list.
    const { data, error } = await createOwnerClient()
      .from("projects")
      .select(PROJECT_COLUMNS)
      .order("created_at", { ascending: false })
      .abortSignal(new AbortController().signal);
    if (error) throw new Error(error.message);
    return { ok: true, plan, projects: data.map(projectFromRow) };
  } catch (error) {
    console.error("loading projects failed", error instanceof Error ? error.message : error);
    return { ok: false };
  }
}

async function Projects() {
  const loaded = await loadProjects();
  if (!loaded.ok) {
    return (
      <ErrorState
        title="We couldn't load your projects"
        description="Something went wrong. Reload the page to try again."
        action={
          <a
            href="/dashboard"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-gray-800"
          >
            Reload
          </a>
        }
      />
    );
  }
  return (
    <>
      {loaded.projects.length > 0 ? (
        <div className="mb-4 flex justify-end">
          <NewProjectButton plan={loaded.plan} />
        </div>
      ) : null}
      <ProjectList projects={loaded.projects} plan={loaded.plan} />
    </>
  );
}

// No app/dashboard/loading.tsx on purpose: it would wrap /dashboard/projects/[id] too,
// so its notFound() would arrive after a 200 had been streamed. This page's own
// Suspense below is its loading state.
export default async function ProjectsPage() {
  await auth.protect();
  return (
    <>
      <PageHeader title="Projects" description="Each project is one chat widget for one website." />
      <Suspense fallback={<ProjectsSkeleton />}>
        <Projects />
      </Suspense>
    </>
  );
}
