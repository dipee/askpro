import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { idParamsSchema } from "@askwell/shared";
import { ProjectTabs } from "../../../../components/project/project-tabs";
import { getOwnedProject } from "../../../../lib/projects";

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

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm">
        <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
          ← Projects
        </Link>
      </nav>
      <h1 className="mb-4 truncate text-2xl font-semibold tracking-tight">{project.name}</h1>
      <ProjectTabs projectId={project.id} />
      <div className="mt-6">{children}</div>
    </>
  );
}
