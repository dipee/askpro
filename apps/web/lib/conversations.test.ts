import { listConversationsQuerySchema } from "@askwell/shared";
import { describe, expect, it } from "vitest";
import {
  queryObject,
  toConversation,
  toConversationSummary,
  toMessage,
} from "./conversations";

describe("listConversationsQuerySchema (packages/shared)", () => {
  it("defaults to limit 50, offset 0", () => {
    expect(listConversationsQuerySchema.parse({})).toEqual({ limit: 50, offset: 0 });
  });

  it("accepts the bounds as query strings", () => {
    expect(listConversationsQuerySchema.parse({ limit: "1", offset: "0" })).toEqual({ limit: 1, offset: 0 });
    expect(listConversationsQuerySchema.parse({ limit: "100", offset: "250" })).toEqual({ limit: 100, offset: 250 });
  });

  it.each([{ limit: "0" }, { limit: "101" }, { limit: "1.5" }, { limit: "x" }, { offset: "-1" }, { offset: "1.5" }])(
    "rejects %o",
    (query) => {
      expect(listConversationsQuerySchema.safeParse(query).success).toBe(false);
    },
  );
});

describe("queryObject", () => {
  it("uses the first value of a repeated param", () => {
    expect(queryObject(new URLSearchParams("limit=5&limit=500&offset=2"))).toEqual({ limit: "5", offset: "2" });
  });
});

describe("row mapping", () => {
  it("maps an owner_activity row, keeping a null preview", () => {
    expect(
      toConversationSummary({
        id: "c1",
        visitor_id: "visitor_0001",
        created_at: "2026-11-12T09:00:00+00:00",
        preview: null as unknown as string,
        message_count: 0,
      }),
    ).toEqual({ id: "c1", visitorId: "visitor_0001", createdAt: "2026-11-12T09:00:00+00:00", preview: null, messageCount: 0 });
  });

  it("maps a conversation row", () => {
    expect(
      toConversation({ id: "c1", project_id: "p1", visitor_id: "visitor_0001", created_at: "2026-11-12T09:00:00Z" }),
    ).toEqual({ id: "c1", projectId: "p1", visitorId: "visitor_0001", createdAt: "2026-11-12T09:00:00Z" });
  });

  it("maps message rows and drops an unknown role", () => {
    const row = { id: "m1", role: "bot", body: "Hi", created_at: "2026-11-12T09:00:00Z" };
    expect(toMessage(row)).toEqual({ id: "m1", role: "bot", body: "Hi", createdAt: "2026-11-12T09:00:00Z" });
    expect(toMessage({ ...row, role: "system" })).toBeNull();
  });
});
