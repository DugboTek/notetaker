import { describe, expect, it } from "vitest";
import { errorMessage } from "./errors";

describe("errorMessage", () => {
  it("returns message for Error objects", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("returns raw string for string errors", () => {
    expect(errorMessage("nope")).toBe("nope");
  });

  it("serializes plain objects", () => {
    expect(errorMessage({ code: 123 })).toBe('{"code":123}');
  });
});

