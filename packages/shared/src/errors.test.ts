import { describe, expect, it } from "vitest";
import { apiError, ERROR_HTTP_STATUS } from "./errors";

describe("apiError", () => {
  it("builds { error: { code, message } }", () =>
    expect(apiError("not_found", "No such project")).toEqual({
      error: { code: "not_found", message: "No such project" },
    }));
  it("maps payment_required to 402", () => expect(ERROR_HTTP_STATUS.payment_required).toBe(402));
});
