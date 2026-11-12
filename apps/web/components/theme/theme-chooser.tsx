"use client";

import { THEME_CHOICES, writeThemeChoice, type ThemeChoice } from "../../lib/theme";
import { cn } from "../ui/cn";
import { ThemeIcon } from "./theme-icons";
import { useThemeChoice } from "./use-theme-choice";

const LABELS: Record<ThemeChoice, { label: string; hint: string }> = {
  system: { label: "System", hint: "Match your device" },
  light: { label: "Light", hint: "Always light" },
  dark: { label: "Dark", hint: "Always dark" },
};

type ThemeOptionsProps = {
  value: ThemeChoice;
  onChange: (choice: ThemeChoice) => void;
};

/** The three theme options as a radio group. Pure: the value comes in as a prop. */
export function ThemeOptions({ value, onChange }: ThemeOptionsProps) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-foreground">Theme</legend>
      <p className="mt-1 text-sm text-muted-foreground">Choose how the dashboard looks on this device.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {THEME_CHOICES.map((choice) => (
          <label
            key={choice}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
              value === choice
                ? // bg-background, not bg-muted: the hint stays ≥ 4.5:1 in light mode.
                  "border-foreground bg-background text-foreground ring-1 ring-foreground"
                : "border-border text-muted-foreground hover:bg-hover hover:text-foreground",
            )}
          >
            <input
              type="radio"
              name="dashboard-theme"
              value={choice}
              checked={value === choice}
              onChange={() => onChange(choice)}
              className="sr-only"
            />
            <ThemeIcon choice={choice} className="size-5 shrink-0" />
            <span className="flex flex-col">
              <span className="font-medium text-foreground">{LABELS[choice].label}</span>
              <span className="text-xs text-muted-foreground">{LABELS[choice].hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Theme picker, saved per device. Lives on the Appearance page of the user menu. */
export function ThemeChooser() {
  const value = useThemeChoice();
  return <ThemeOptions value={value} onChange={writeThemeChoice} />;
}
