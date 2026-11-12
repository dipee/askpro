/**
 * Dashboard theme (project.md §13): the owner picks System, Light or Dark in the user
 * menu. The choice lives in localStorage; System follows prefers-color-scheme.
 *
 * The resolved theme goes on `<html data-theme="light|dark">`. globals.css applies the
 * dark tokens only while the dashboard is on the page, so the landing stays dark and
 * /embed stays light whatever is stored.
 */

export const THEME_CHOICES = ["system", "light", "dark"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "dashboard-theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";
/** Fired on window when this tab changes the choice. */
export const THEME_CHANGE_EVENT = "dashboard-theme-change";

/** A stored value as a choice. Anything unknown (or nothing) means System. */
export function parseThemeChoice(value: unknown): ThemeChoice {
  return THEME_CHOICES.includes(value as ThemeChoice) ? (value as ThemeChoice) : "system";
}

/** The theme to show: the stored choice, or the OS setting for System. */
export function resolveTheme(choice: ThemeChoice, systemDark: boolean): ResolvedTheme {
  if (choice === "system") return systemDark ? "dark" : "light";
  return choice;
}

/**
 * The choice made in this tab when storage refused it (blocked, private mode, full).
 * It wins over storage until a later write succeeds, so the picker and <html> agree.
 */
let unsavedChoice: ThemeChoice | null = null;

/** The current choice: an unsaved one from this tab, else the stored one. Storage can throw: then System. */
export function readThemeChoice(): ThemeChoice {
  if (unsavedChoice !== null) return unsavedChoice;
  try {
    return parseThemeChoice(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

/** Stores the choice (best effort; kept in memory if storage refuses) and tells this tab's listeners. */
export function writeThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice);
    unsavedChoice = null;
  } catch {
    // Not persisted: keep it for this tab until reload.
    unsavedChoice = choice;
  }
  applyTheme(choice);
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: choice }));
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

/** Puts the resolved theme on <html>. */
export function applyTheme(choice: ThemeChoice): void {
  document.documentElement.dataset.theme = resolveTheme(choice, systemPrefersDark());
}

/**
 * Inline <head> script: applies the stored choice before first paint, so a dark-mode
 * owner never sees a light flash. Same rules as parseThemeChoice + resolveTheme
 * (theme.test.ts runs it against them). Plain ES5, no imports.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var c=null;try{c=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})}catch(e){}var d=c==="dark"||(c!=="light"&&window.matchMedia(${JSON.stringify(
  DARK_QUERY,
)}).matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})();`;
