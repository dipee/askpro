import type { Metadata } from "next";
import { APP_NAME, publicKeySchema } from "@askwell/shared";
import { ChatUnavailable } from "../../components/embed/chat-unavailable";
import { EmbedPanel } from "../../components/embed/embed-panel";
import { parseParentOrigin } from "../../components/embed/parent-messaging";

export const metadata: Metadata = {
  title: `${APP_NAME} chat`,
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// The chat panel inside the widget iframe (project.md §6.5). Public and
// frameable by any site; `origin` is the host page's origin, passed by the loader.
export default async function EmbedPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const key = publicKeySchema.safeParse(first(params.key));
  if (!key.success) return <ChatUnavailable />;
  return <EmbedPanel publicKey={key.data} parentOrigin={parseParentOrigin(first(params.origin))} />;
}
