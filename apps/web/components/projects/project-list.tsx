import type { Plan, Project } from "@askwell/shared";
import { currentUsage } from "../../lib/usage";
import { EmptyState } from "../ui/empty-state";
import { NewProjectButton } from "./new-project-button";
import { ProjectCard } from "./project-card";

/**
 * The owner's projects as cards, or the empty state with a working "New project".
 * A server component: usage is worked out here, from the plan the server read.
 */
export function ProjectList({
  projects,
  plan,
  now = new Date(),
}: {
  projects: Project[];
  plan: Plan;
  /** For tests; defaults to the request time. */
  now?: Date;
}) {
  if (projects.length === 0) {
    return (
      <EmptyState
        title="No projects yet"
        description="Create a project to add your knowledge and get the embed code for your site."
        action={<NewProjectButton plan={plan} />}
      />
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {projects.map((project) => (
        <li key={project.id} className="min-w-0">
          <ProjectCard project={project} usage={currentUsage(project, plan, now)} />
        </li>
      ))}
    </ul>
  );
}
