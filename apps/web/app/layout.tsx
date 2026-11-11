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
      <html lang="en">
        <body className="antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
