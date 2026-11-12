import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { APP_NAME, idParamsSchema } from "@askwell/shared";
import { CopySnippet } from "../../../../../components/project/copy-snippet";
import { installSnippet } from "../../../../../components/project/install-snippet";
import { ErrorState } from "../../../../../components/ui/error-state";
import { GlassPanel } from "../../../../../components/ui/glass-panel";
import { getAppUrl } from "../../../../../lib/app-url";
import { getOwnedProject } from "../../../../../lib/projects";

export const metadata: Metadata = { title: `Install · ${APP_NAME}` };

const STEPS = [
  "Paste the snippet just before </body> on every page where the chat should appear.",
  "Reload your site.",
  "Click the chat button in the corner to open it.",
];

export default async function InstallPage({ params }: { params: Promise<{ id: string }> }) {
  const parsed = idParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  // Same read as the layout; Next.js memoizes it within this render.
  const project = await getOwnedProject(parsed.data.id);
  if (!project) notFound();

  const appUrl = await getAppUrl();
  if (!appUrl) {
    return (
      <ErrorState
        title="We couldn't build your snippet"
        description="The app's address isn't known. Reload the page, or set NEXT_PUBLIC_APP_URL."
      />
    );
  }

  return (
    <GlassPanel className="flex flex-col gap-6 p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Add the chat to your site</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This snippet is unique to this project. It only identifies the project; it isn&apos;t a secret.
        </p>
      </div>
      <CopySnippet snippet={installSnippet(appUrl, project.publicKey)} />
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
        {STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </GlassPanel>
  );
}
