import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("../ai/openai", () => ({
  CHAT_MODEL: "test-chat-model",
  openai: () => ({ chat: { completions: { create } } }),
}));

const { generateReply, MAX_REPLY_TOKENS } = await import("./reply");
const { CHAT_SYSTEM_PROMPT, I_DONT_KNOW_REPLY } = await import("./prompt");

const completion = (content: string | null) => ({ choices: [{ message: { content } }] });

beforeEach(() => {
  // Braces matter: a function returned from beforeEach runs as teardown.
  create.mockReset();
});

describe("generateReply", () => {
  it("sends the system prompt and the delimited excerpts to CHAT_MODEL", async () => {
    create.mockResolvedValue(completion("  We open at 9.  "));
    await expect(generateReply([{ content: "We open at 9." }], "When do you open?")).resolves.toBe("We open at 9.");

    const [params] = create.mock.calls[0] as [Record<string, unknown>];
    expect(params).toMatchObject({ model: "test-chat-model", temperature: 0, max_completion_tokens: MAX_REPLY_TOKENS });
    const messages = params.messages as { role: string; content: string }[];
    expect(messages[0]).toEqual({ role: "system", content: CHAT_SYSTEM_PROMPT });
    expect(messages[1]?.role).toBe("user");
    expect(messages[1]?.content).toContain('<excerpt id="1">\nWe open at 9.\n</excerpt>');
    expect(messages[1]?.content).toContain("<question>\nWhen do you open?\n</question>");
  });

  it("returns the fixed reply without a model call when there are no excerpts", async () => {
    await expect(generateReply([], "Anything?")).resolves.toBe(I_DONT_KNOW_REPLY);
    expect(create).not.toHaveBeenCalled();
  });

  it("throws on an empty reply", async () => {
    create.mockResolvedValue(completion(null));
    await expect(generateReply([{ content: "x" }], "q")).rejects.toThrow(/empty reply/);
  });

  it("passes a model error through", async () => {
    create.mockRejectedValue(new Error("503"));
    await expect(generateReply([{ content: "x" }], "q")).rejects.toThrow("503");
  });
});
