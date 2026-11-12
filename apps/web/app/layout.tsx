import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { APP_NAME } from "@askwell/shared";
import {
  AFTER_AUTH_URL,
  AFTER_SIGN_OUT_URL,
  SIGN_IN_URL,
  SIGN_UP_URL,
} from "@/lib/auth/routes";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      signInUrl={SIGN_IN_URL}
      signUpUrl={SIGN_UP_URL}
      signInFallbackRedirectUrl={AFTER_AUTH_URL}
      signUpFallbackRedirectUrl={AFTER_AUTH_URL}
      afterSignOutUrl={AFTER_SIGN_OUT_URL}
    >
      {/* The head script sets data-theme before hydration, hence suppressHydrationWarning. */}
      <html lang="en" suppressHydrationWarning>
        <head>
          {/* Dashboard theme before first paint: no light flash in dark mode (lib/theme.ts). */}
          <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        </head>
        <body className="antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
