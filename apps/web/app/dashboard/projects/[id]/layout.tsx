import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { idParamsSchema } from "@askwell/shared";
import { ProjectTabs } from "../../../../components/project/project-tabs";
import { UsageMeter } from "../../../../components/usage/usage-meter";
import { ensureAccount } from "../../../../lib/accounts";
import { getOwnedProject } from "../../../../lib/projects";
import { currentUsage, type Usage } from "../../../../lib/usage";

/** This month's usage, with the plan read on the server. Null if the plan can't be read. */
async function loadUsage(project: Parameters<typeof currentUsage>[0]): Promise<Usage | null> {
  try {
    const { plan } = await ensureAccount();
    return currentUsage(project, plan, new Date());
  } catch (error) {
    console.error("loading the plan failed", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * One project: back link, name and tabs. getOwnedProject reads with the owner
 * client, so another owner's project (or a made-up id) is a 404, same as missing.
 */
export default async function ProjectLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: ReactNode;
}) {
  await auth.protect();
  const parsed = idParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const project = await getOwnedProject(parsed.data.id);
  if (!project) notFound();
  const usage = await loadUsage(project);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm">
        <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
          ← Projects
        </Link>
      </nav>
      <h1 className="truncate text-2xl font-semibold tracking-tight">{project.name}</h1>
      <div className="mt-2 mb-4 max-w-sm">
        {usage ? (
          <UsageMeter usage={usage} />
        ) : (
          <p className="text-sm text-muted-foreground">Usage is unavailable right now. Reload to try again.</p>
        )}
      </div>
      <ProjectTabs projectId={project.id} />
      <div className="mt-6">{children}</div>
    </>
  );
}
