import type { Metadata } from "next";
import { APP_NAME } from "@askwell/shared";
import { ComingSoon } from "../../../../../components/project/coming-soon";

export const metadata: Metadata = { title: `Customize · ${APP_NAME}` };

export default function CustomizePage() {
  return <ComingSoon title="Customize" description="Change the button color, position, label, animation and header (Pro)." />;
}
