"use client";

import { usePathname } from "next/navigation";
import { ProjectTabLinks } from "./project-tab-links";

/** Tab bar for one project; highlights the current tab. */
export function ProjectTabs({ projectId }: { projectId: string }) {
  return <ProjectTabLinks projectId={projectId} pathname={usePathname()} />;
}
