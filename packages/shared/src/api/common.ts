import { z } from "zod";

/** Route params for `/:id` routes. Every row ID is a UUID. */
export const idParamsSchema = z.object({ id: z.uuid() });
export type IdParams = z.infer<typeof idParamsSchema>;

/** A project's public key: `pk_` + random URL-safe characters. */
export const publicKeySchema = z.string().regex(/^pk_[A-Za-z0-9_-]{1,64}$/, "Invalid public key");

/** Response of routes that only confirm success (deletes, webhook). */
export interface OkResponse {
  ok: true;
}
