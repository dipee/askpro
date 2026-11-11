import { clerkMiddleware } from "@clerk/nextjs/server";
import { gateRequest, SIGN_IN_URL, SIGN_UP_URL } from "@/lib/auth/routes";

// Early gate for owner pages and owner API routes. Each protected page and
// Route Handler still checks auth itself; this is not the only check.
export default clerkMiddleware(
  (auth, req) => gateRequest(() => auth(), req.nextUrl),
  { signInUrl: SIGN_IN_URL, signUpUrl: SIGN_UP_URL },
);

export const config = {
  matcher: [
    // Skip Next internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
