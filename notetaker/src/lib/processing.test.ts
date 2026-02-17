import { describe, expect, it } from "vitest";
import { computeChunkProgress, getProcessingConfig, mapWithConcurrency } from "./processing";

describe("processing helpers", () => {
  it("uses sensible defaults and bounded overrides", () => {
    expect(getProcessingConfig({} as NodeJS.ProcessEnv)).toEqual({
      chunkConcurrency: 4,
      maxChunksPerPass: 24,
      loopBudgetMs: 180000,
      idleWaitMs: 1000,
    });

    expect(
      getProcessingConfig({
        PROCESSING_CHUNK_CONCURRENCY: "99",
        PROCESSING_MAX_CHUNKS_PER_PASS: "-2",
        PROCESSING_LOOP_BUDGET_MS: "5000",
        PROCESSING_IDLE_WAIT_MS: "10000",
      }),
    ).toEqual({
      chunkConcurrency: 8,
      maxChunksPerPass: 1,
      loopBudgetMs: 10000,
      idleWaitMs: 5000,
    });
  });

  it("computes progress counters from chunk states", () => {
    const result = computeChunkProgress([
      { status: "uploading", transcript_text: null },
      { status: "uploaded", transcript_text: null },
      { status: "processing", transcript_text: null },
      { status: "processed", transcript_text: "hello" },
      { status: "uploaded", transcript_text: "already here" },
      { status: "error", transcript_text: null },
    ]);

    expect(result).toEqual({
      total: 6,
      waitingUploads: 1,
      queued: 1,
      inFlight: 1,
      processed: 2,
      errored: 1,
      remaining: 3,
      hasErrors: true,
    });
  });

  it("runs work with concurrency limit and keeps output order", async () => {
    let active = 0;
    let maxSeen = 0;

    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      maxSeen = Math.max(maxSeen, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return value * 10;
    });

    expect(maxSeen).toBeLessThanOrEqual(2);
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });
});
