"use client";

import { UserButton } from "@clerk/nextjs";
import { ThemeChooser } from "./theme-chooser";
import { ThemeIcon } from "./theme-icons";

export const APPEARANCE_PAGE_URL = "appearance";

/**
 * Clerk's user button with an "Appearance" item: it opens a page in the account dialog
 * where the owner picks System, Light or Dark.
 */
export function UserMenu() {
  const icon = <ThemeIcon choice="dark" />;
  return (
    <UserButton>
      <UserButton.MenuItems>
        <UserButton.Action label="Appearance" labelIcon={icon} open={APPEARANCE_PAGE_URL} />
      </UserButton.MenuItems>
      <UserButton.UserProfilePage label="Appearance" url={APPEARANCE_PAGE_URL} labelIcon={icon}>
        <ThemeChooser />
      </UserButton.UserProfilePage>
    </UserButton>
  );
}
