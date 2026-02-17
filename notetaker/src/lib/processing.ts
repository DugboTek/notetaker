type ChunkProgressInput = {
  status: string;
  transcript_text?: string | null;
};

function parseBoundedInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const asInt = Math.trunc(parsed);
  if (asInt < min) return min;
  if (asInt > max) return max;
  return asInt;
}

export function getProcessingConfig(env = process.env) {
  return {
    chunkConcurrency: parseBoundedInt(env.PROCESSING_CHUNK_CONCURRENCY, 4, 1, 8),
    maxChunksPerPass: parseBoundedInt(env.PROCESSING_MAX_CHUNKS_PER_PASS, 24, 1, 160),
    loopBudgetMs: parseBoundedInt(env.PROCESSING_LOOP_BUDGET_MS, 180_000, 10_000, 240_000),
    idleWaitMs: parseBoundedInt(env.PROCESSING_IDLE_WAIT_MS, 1_000, 200, 5_000),
  };
}

export function computeChunkProgress(chunks: ChunkProgressInput[]) {
  let waitingUploads = 0;
  let queued = 0;
  let inFlight = 0;
  let processed = 0;
  let errored = 0;

  for (const chunk of chunks) {
    const hasTranscript = Boolean((chunk.transcript_text ?? "").trim());
    if (chunk.status === "error") {
      errored += 1;
      continue;
    }
    if (chunk.status === "uploading") {
      waitingUploads += 1;
      continue;
    }
    if (chunk.status === "processing") {
      inFlight += 1;
      continue;
    }
    if (chunk.status === "processed" || hasTranscript) {
      processed += 1;
      continue;
    }
    if (chunk.status === "uploaded") {
      queued += 1;
    }
  }

  return {
    total: chunks.length,
    waitingUploads,
    queued,
    inFlight,
    processed,
    errored,
    remaining: waitingUploads + queued + inFlight,
    hasErrors: errored > 0,
  };
}

export async function mapWithConcurrency<T, R>(items: T[], maxConcurrent: number, fn: (item: T, index: number) => Promise<R>) {
  if (items.length === 0) return [] as R[];

  const limit = Math.max(1, Math.trunc(maxConcurrent) || 1);
  const output = new Array<R>(items.length);
  let next = 0;

  const worker = async () => {
    while (true) {
      const idx = next;
      next += 1;
      if (idx >= items.length) return;
      output[idx] = await fn(items[idx], idx);
    }
  };

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(runners);
  return output;
}
