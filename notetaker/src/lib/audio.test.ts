import { describe, expect, it } from "vitest";
import { extForMime } from "./audio";

describe("extForMime", () => {
  it("maps known mime types to expected file extensions", () => {
    expect(extForMime("audio/webm;codecs=opus")).toBe("webm");
    expect(extForMime("audio/ogg")).toBe("ogg");
    expect(extForMime("audio/mpeg")).toBe("mp3");
    expect(extForMime("audio/mp4")).toBe("m4a");
    expect(extForMime("audio/wav")).toBe("wav");
  });

  it("falls back to bin for unknown mime types", () => {
    expect(extForMime("application/octet-stream")).toBe("bin");
  });
});

