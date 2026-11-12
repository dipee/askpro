import type { Metadata } from "next";
import { APP_NAME } from "@askwell/shared";
import { ComingSoon } from "../../../../../components/project/coming-soon";

export const metadata: Metadata = { title: `Knowledge · ${APP_NAME}` };

export default function KnowledgePage() {
  return <ComingSoon title="Knowledge" description="Add pasted text and PDF, Markdown or TXT files. The bot answers from them." />;
}
