"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Fades and slides its children in when they scroll into view.
 * Progressive: the server renders content visible; only elements still below
 * the fold after hydration are hidden and revealed. Does nothing when the
 * visitor prefers reduced motion.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return; // already on screen

    el.dataset.reveal = "hidden";
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.dataset.reveal = "shown";
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition duration-700 ease-out data-[reveal=hidden]:translate-y-6 data-[reveal=hidden]:opacity-0 motion-reduce:transition-none ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
