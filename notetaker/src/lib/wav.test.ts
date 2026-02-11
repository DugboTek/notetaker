import { describe, expect, it } from "vitest";
import { encodeWav16kMono } from "./wav";

function readAscii(bytes: Uint8Array, start: number, len: number) {
  return new TextDecoder("ascii").decode(bytes.slice(start, start + len));
}

describe("encodeWav16kMono", () => {
  it("writes RIFF/WAVE headers and expected size", () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const bytes = encodeWav16kMono(samples, 16_000);

    expect(readAscii(bytes, 0, 4)).toBe("RIFF");
    expect(readAscii(bytes, 8, 4)).toBe("WAVE");
    expect(readAscii(bytes, 12, 4)).toBe("fmt ");
    expect(readAscii(bytes, 36, 4)).toBe("data");
    expect(bytes.byteLength).toBe(44 + samples.length * 2);
  });
});

