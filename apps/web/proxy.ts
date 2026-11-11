import { clerkMiddleware } from "@clerk/nextjs/server";
import { gateRequest, SIGN_IN_URL, SIGN_UP_URL } from "./lib/auth/routes";

// Early gate for owner pages and owner API routes. Each protected page and
// Route Handler still checks auth itself; this is not the only check.
export default clerkMiddleware(
  (auth, req) => gateRequest(() => auth(), req.nextUrl),
  { signInUrl: SIGN_IN_URL, signUpUrl: SIGN_UP_URL },
);

export const config = {
  matcher: [
    // Skip Next internals, static files and /embed. /embed is the public chat
    // panel inside the widget iframe on customers' sites: Clerk's handshake
    // redirect loops there when third-party cookies are blocked, and the panel
    // never uses auth.
    "/((?!_next|embed(?:/|$)|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
