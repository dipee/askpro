import type { ReactNode } from "react";
import { Reveal } from "./reveal";

/** A landing section with an eyebrow, title, optional intro and scroll-in motion. */
export function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 md:py-28">
      <Reveal>
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">{eyebrow}</p>
        <h2 id={`${id}-title`} className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h2>
        {intro ? <p className="mt-4 max-w-2xl text-base text-muted-foreground">{intro}</p> : null}
      </Reveal>
      <div className="mt-12">{children}</div>
    </section>
  );
}
