"use client";

import { useEffect } from "react";
import { DARK_QUERY, applyTheme, readThemeChoice } from "../../lib/theme";
import { useThemeChoice } from "./use-theme-choice";

/**
 * Keeps <html data-theme> right after first paint (the inline head script sets it
 * before): when the choice changes in another tab, and when the OS switches between
 * light and dark while the choice is System.
 */
export function ThemeSync() {
  const choice = useThemeChoice();

  useEffect(() => {
    // Read the store, not `choice`: on the hydration render `choice` is the server
    // snapshot ("system"), and applying it would undo the head script for a frame.
    // `choice` stays a dependency so every later change re-runs this.
    const current = readThemeChoice();
    applyTheme(current);
    if (current !== "system") return;
    let media: MediaQueryList;
    try {
      media = window.matchMedia(DARK_QUERY);
    } catch {
      return;
    }
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [choice]);

  return null;
}
