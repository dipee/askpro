import Link from "next/link";
import { APP_NAME } from "@askwell/shared";
import { primaryCta, secondaryCta } from "./styles";

// Entrance motion is pure CSS (`starting:` = @starting-style), so it needs no
// JavaScript and is skipped with prefers-reduced-motion.
const enter =
  "transition duration-700 ease-out starting:translate-y-4 starting:opacity-0 motion-reduce:transition-none";

/** First screen: name, one-line pitch, Start free. */
export function Hero() {
  return (
    <section className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-4 pt-24 pb-20 text-center sm:px-6 md:pt-32">
      <p className={`${enter} rounded-full border border-glass-border bg-glass px-4 py-1.5 text-xs text-muted-foreground backdrop-blur-glass`}>
        AI support chat for any website
      </p>
      <h1 className={`${enter} mt-6 text-5xl font-semibold tracking-tight delay-100 sm:text-7xl`}>{APP_NAME}</h1>
      <p className={`${enter} mt-6 max-w-xl text-lg text-muted-foreground delay-200 sm:text-xl`}>
        Add what you know, paste one script tag, and your visitors get instant answers from your own docs.
      </p>
      <div className={`${enter} mt-10 flex w-full flex-col items-center justify-center gap-3 delay-300 sm:flex-row`}>
        <Link href="/sign-up" className={`${primaryCta} w-full sm:w-auto`}>
          Start free
        </Link>
        <a href="#how-it-works" className={`${secondaryCta} w-full sm:w-auto`}>
          See how it works
        </a>
      </div>
    </section>
  );
}
