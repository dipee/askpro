import {
  createTextKnowledgeSchema,
  MAX_KNOWLEDGE_TEXT_CHARS,
  MAX_KNOWLEDGE_TITLE_CHARS,
  type CreateTextKnowledgeResponse,
} from "@askwell/shared";
import type { NextRequest } from "next/server";
import { errorResponse } from "../../../../../lib/api/errors";
import { processSource } from "../../../../../lib/knowledge/process";
import { readJsonBody } from "../../../../../lib/projects";
import { gateOwnedProject, isResponse, reserveSource } from "./shared";

// Owner route: no CORS headers. Processing runs inline (at most 100,000 characters).
export const maxDuration = 60;

/**
 * POST /api/projects/:id/knowledge: paste text. Reserves a `text` source under the plan
 * limit, then chunks and embeds it. 201 with the source, `ready` or `failed`.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/projects/[id]/knowledge">): Promise<Response> {
  const gate = await gateOwnedProject(ctx.params);
  if (isResponse(gate)) return gate;

  const input = createTextKnowledgeSchema.safeParse(await readJsonBody(request));
  if (!input.success) {
    return errorResponse(
      "validation",
      `Give the text a title (1–${MAX_KNOWLEDGE_TITLE_CHARS} characters) and some text (up to ${MAX_KNOWLEDGE_TEXT_CHARS.toLocaleString("en-US")} characters).`,
    );
  }

  const source = await reserveSource({ ...gate, type: "text", title: input.data.title });
  if (isResponse(source)) return source;

  const result = await processSource({ projectId: gate.projectId, sourceId: source.id, text: input.data.text });

  const body: CreateTextKnowledgeResponse = { source: { ...source, status: result.status } };
  return Response.json(body, { status: 201 });
}
