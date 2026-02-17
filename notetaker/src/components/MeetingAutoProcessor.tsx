"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/errors";

const ACTIVE_STATUSES = new Set(["uploading", "uploaded", "processing"]);

type ProcessResponse = {
  status?: string;
  waitingUploads?: number;
  processedChunkSeq?: number;
  processedChunks?: number;
  totalChunks?: number;
  remainingChunks?: number;
  shouldContinue?: boolean;
};

export function MeetingAutoProcessor(props: { meetingId: string; initialStatus: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(props.initialStatus);
  const [waitingUploads, setWaitingUploads] = useState<number>(0);
  const [remainingChunks, setRemainingChunks] = useState<number>(0);
  const [lastChunk, setLastChunk] = useState<number | null>(null);
  const [processedChunks, setProcessedChunks] = useState<number>(0);
  const [totalChunks, setTotalChunks] = useState<number>(0);
  const [pollMs, setPollMs] = useState<number>(1200);
  const [err, setErr] = useState("");
  const inFlight = useRef(false);

  const active = useMemo(() => ACTIVE_STATUSES.has(status), [status]);

  useEffect(() => {
    if (!active) return;
    let stopped = false;

    const tick = async () => {
      if (stopped || inFlight.current) return;
      inFlight.current = true;
      try {
        const res = await fetch(`/api/meetings/${props.meetingId}/process`, { method: "POST" });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as ProcessResponse;

        const nextStatus = data.status || "processing";
        setStatus(nextStatus);
        setWaitingUploads(data.waitingUploads ?? 0);
        setRemainingChunks(data.remainingChunks ?? 0);
        setProcessedChunks(data.processedChunks ?? 0);
        setTotalChunks(data.totalChunks ?? 0);
        setPollMs(data.shouldContinue ? 300 : 1200);
        setLastChunk(typeof data.processedChunkSeq === "number" ? data.processedChunkSeq : null);

        if (nextStatus === "ready" || nextStatus === "error") {
          stopped = true;
          router.refresh();
        }
      } catch (e: unknown) {
        setErr(errorMessage(e));
      } finally {
        inFlight.current = false;
      }
    };

    void tick();
    const t = setInterval(() => void tick(), pollMs);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [active, pollMs, props.meetingId, router]);

  if (!active && !err) return null;

  return (
    <section className="rounded-2xl border border-black/10 bg-white/70 p-4 text-sm text-black/70 shadow-sm backdrop-blur">
      <div className="font-semibold text-black">Processing status: {status}</div>
      {totalChunks > 0 ? <div className="mt-1">Processed chunks: {processedChunks} / {totalChunks}</div> : null}
      {waitingUploads > 0 ? <div className="mt-1">Waiting for uploads: {waitingUploads}</div> : null}
      {typeof lastChunk === "number" ? <div className="mt-1">Last processed chunk: #{lastChunk}</div> : null}
      {remainingChunks > 0 ? <div className="mt-1">Remaining chunks: {remainingChunks}</div> : null}
      {err ? <div className="mt-2 text-red-700">{err}</div> : null}
    </section>
  );
}
