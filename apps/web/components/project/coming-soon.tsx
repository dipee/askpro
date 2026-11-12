import { EmptyState } from "../ui/empty-state";

/** Placeholder for project tabs that later phases build. */
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return <EmptyState title={`${title} is coming soon`} description={description} />;
}
