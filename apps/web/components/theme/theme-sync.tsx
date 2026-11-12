"use client";

import { useEffect } from "react";
import { DARK_QUERY, applyTheme } from "../../lib/theme";
import { useThemeChoice } from "./use-theme-choice";

/**
 * Keeps <html data-theme> right after first paint (the inline head script sets it
 * before): when the choice changes in another tab, and when the OS switches between
 * light and dark while the choice is System.
 */
export function ThemeSync() {
  const choice = useThemeChoice();

  useEffect(() => {
    applyTheme(choice);
    if (choice !== "system") return;
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
