import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { APP_NAME, idParamsSchema, type KnowledgeSource, type Plan } from "@askwell/shared";
import { toKnowledgeSource } from "../../../../../components/knowledge/format";
import { KnowledgeManager } from "../../../../../components/knowledge/knowledge-manager";
import { ErrorState } from "../../../../../components/ui/error-state";
import { ensureAccount } from "../../../../../lib/accounts";
import { getOwnedProject } from "../../../../../lib/projects";
import { createOwnerClient } from "../../../../../lib/supabase/owner";

export const metadata: Metadata = { title: `Knowledge · ${APP_NAME}` };

type Loaded = { ok: true; plan: Plan; sources: KnowledgeSource[] } | { ok: false };

/** The plan (from our database) and the project's sources, newest first. Owner client: RLS scopes the read. */
async function loadKnowledge(projectId: string): Promise<Loaded> {
  try {
    const { plan } = await ensureAccount();
    // A fresh AbortSignal opts out of Next.js fetch memoization, so router.refresh()
    // while a source is processing always gets the current statuses.
    const { data, error } = await createOwnerClient()
      .from("knowledge_sources")
      .select("id, project_id, title, type, status, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .abortSignal(new AbortController().signal);
    if (error) throw new Error(error.message);
    const sources = data.flatMap((row) => {
      const source = toKnowledgeSource(row);
      return source ? [source] : [];
    });
    return { ok: true, plan, sources };
  } catch (error) {
    console.error("loading knowledge failed", error instanceof Error ? error.message : error);
    return { ok: false };
  }
}

export default async function KnowledgePage({ params }: { params: Promise<{ id: string }> }) {
  const parsed = idParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  // Same read as the layout; Next.js memoizes it within this render.
  const project = await getOwnedProject(parsed.data.id);
  if (!project) notFound();

  const loaded = await loadKnowledge(project.id);
  if (!loaded.ok) {
    return (
      <ErrorState
        title="We couldn't load your knowledge"
        description="Something went wrong. Reload the page to try again."
        action={
          <a
            href={`/dashboard/projects/${project.id}/knowledge`}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
          >
            Reload
          </a>
        }
      />
    );
  }

  return <KnowledgeManager projectId={project.id} plan={loaded.plan} sources={loaded.sources} />;
}
