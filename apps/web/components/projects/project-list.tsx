import type { Plan, Project } from "@askwell/shared";
import { EmptyState } from "../ui/empty-state";
import { NewProjectButton } from "./new-project-button";
import { ProjectCard } from "./project-card";

/** The owner's projects as cards, or the empty state with a working "New project". */
export function ProjectList({ projects, plan }: { projects: Project[]; plan: Plan }) {
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
          <ProjectCard project={project} plan={plan} />
        </li>
      ))}
    </ul>
  );
}
