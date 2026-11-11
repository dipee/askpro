// POST /api/clerk/webhook
// Input is Clerk's signed event, verified and typed by Clerk's SDK (`verifyWebhook`);
// we don't redefine Clerk's payload. Responds with OkResponse.

// GET /api/posthog-config
export interface PosthogConfigResponse {
  /** PostHog public project key. */
  key: string;
  /** PostHog API host. */
  host: string;
}
