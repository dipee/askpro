// 401 body for owner API routes when signed out.
// TODO: switch to the shared API error type once A1 lands in packages/shared.
export function unauthorizedResponse(): Response {
  return Response.json(
    { error: { code: "unauthorized", message: "Sign in required." } },
    { status: 401 },
  );
}
