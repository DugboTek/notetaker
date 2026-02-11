import { describe, expect, it } from "vitest";
import { usernameToEmail } from "./username";

describe("usernameToEmail", () => {
  it("passes through real email input", () => {
    expect(usernameToEmail("Sdugbo@Gmail.com")).toBe("sdugbo@gmail.com");
  });

  it("maps simple username to local email", () => {
    expect(usernameToEmail("sister")).toBe("sister@notetaker.user");
  });

  it("sanitizes username and strips unsupported chars", () => {
    expect(usernameToEmail(" sis ter!!! ")).toBe("sister@notetaker.user");
  });

  it("returns empty string for invalid empty username", () => {
    expect(usernameToEmail("!!!")).toBe("");
  });
});

