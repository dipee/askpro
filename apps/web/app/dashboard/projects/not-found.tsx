import Link from "next/link";
import { EmptyState } from "../../../components/ui/empty-state";

/** Missing project, made-up id, or another owner's project: all look the same. */
export default function ProjectNotFound() {
  return (
    <EmptyState
      title="Project not found"
      description="It may have been deleted, or it isn't yours."
      action={
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-gray-800"
        >
          Back to projects
        </Link>
      }
    />
  );
}
