import type { Metadata } from "next";
import { APP_NAME } from "@askwell/shared";
import { DemoPreview } from "../components/landing/demo-preview";
import { Hero } from "../components/landing/hero";
import { HowItWorks } from "../components/landing/how-it-works";
import { InstallSnippet } from "../components/landing/install-snippet";
import { Pricing } from "../components/landing/pricing";
import { SiteFooter } from "../components/landing/site-footer";
import { SiteHeader } from "../components/landing/site-header";

export const metadata: Metadata = {
  title: `${APP_NAME} · AI support chat for any website`,
  description: `${APP_NAME} answers your visitors' questions from your own docs. Add your knowledge, paste one script tag, done.`,
};

// Dark landing (project.md §13). `.dark` swaps the design tokens for this subtree.
export default function Home() {
  return (
    <div className="dark relative isolate min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[48rem] overflow-hidden">
        <div className="absolute top-[-12rem] left-1/2 size-[40rem] -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
      </div>
      <SiteHeader />
      <main>
        <Hero />
        <HowItWorks />
        <DemoPreview />
        <Pricing />
        <InstallSnippet />
      </main>
      <SiteFooter />
    </div>
  );
}
