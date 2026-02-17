function parseBoundedInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const asInt = Math.trunc(parsed);
  if (asInt < min) return min;
  if (asInt > max) return max;
  return asInt;
}

export function getCronConfig(env = process.env) {
  return {
    secret: (env.CRON_SECRET || "").trim(),
    meetingBatchSize: parseBoundedInt(env.CRON_MEETING_BATCH_SIZE, 1, 1, 20),
  };
}

export function isCronAuthorized(req: Request, env = process.env) {
  const { secret } = getCronConfig(env);
  if (!secret) return false;
  const auth = (req.headers.get("authorization") || "").trim();
  return auth === `Bearer ${secret}`;
}
