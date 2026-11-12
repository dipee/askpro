import { redirect } from "next/navigation";

/** A project opens on its Install tab. The layout has already checked ownership. */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/projects/${encodeURIComponent(id)}/install`);
}
