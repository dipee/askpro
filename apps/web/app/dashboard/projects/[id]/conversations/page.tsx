import type { Metadata } from "next";
import { APP_NAME } from "@askwell/shared";
import { ComingSoon } from "../../../../../components/project/coming-soon";

export const metadata: Metadata = { title: `Conversations · ${APP_NAME}` };

export default function ConversationsPage() {
  return <ComingSoon title="Conversations" description="Read what visitors asked and how the bot replied." />;
}
