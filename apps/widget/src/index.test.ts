import { describe, expect, it } from "vitest";

describe("widget entry", () => {
  it("loads without throwing", async () => {
    await expect(import("./index")).resolves.toBeDefined();
  });
});
