import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { APP_NAME } from "@askwell/shared";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: `Billing · ${APP_NAME}` };

export default async function BillingPage() {
  await auth.protect();
  return (
    <>
      <PageHeader title="Billing" description="Your plan and payments." />
      <EmptyState
        title="Billing arrives soon"
        description="You're on the Free plan. Upgrading to Pro will be available here shortly."
      />
    </>
  );
}
