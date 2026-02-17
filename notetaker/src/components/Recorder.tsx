"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/errors";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type RecorderState = "idle" | "recording" | "uploading" | "processing" | "error";
const CHUNK_MS = 60_000;

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function Recorder() {
  const router = useRouter();
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string>("");
  const [seconds, setSeconds] = useState(0);
  const [uploadedChunks, setUploadedChunks] = useState(0);

  const meetingIdRef = useRef<string>("");
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");
  const startedAtRef = useRef<number>(0);
  const seqRef = useRef<number>(0);
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const uploadErrorRef = useRef<string>("");
  const totalBytesRef = useRef<number>(0);

  const canStart = state === "idle" || state === "error";
  const canStop = state === "recording";

  useEffect(() => {
    if (state !== "recording") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  const reset = useCallback(() => {
    setSeconds(0);
    setUploadedChunks(0);
    setError("");
    setState("idle");
    meetingIdRef.current = "";
    seqRef.current = 0;
    totalBytesRef.current = 0;
    uploadErrorRef.current = "";
    uploadQueueRef.current = Promise.resolve();
  }, []);

  const chooseMimeType = useCallback(() => {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
    for (const c of candidates) {
      if (typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(c)) {
        return c;
      }
    }
    return "";
  }, []);

  const stopInternal = useCallback(async () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        // ignore
      }
    }
    mediaRecorderRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
  }, []);

  const uploadChunk = useCallback(async (blob: Blob, seq: number) => {
    const meetingId = meetingIdRef.current;
    if (!meetingId) throw new Error("Missing meeting id");
    if (uploadErrorRef.current) return;
    if (!blob.size) return;

    const mimeType = mimeTypeRef.current || blob.type || "audio/webm";
    totalBytesRef.current += blob.size;

    const signRes = await fetch(`/api/meetings/${meetingId}/chunks/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        seq,
        mimeType,
        sizeBytes: blob.size,
      }),
    });
    if (!signRes.ok) throw new Error(await signRes.text());
    const signJson = (await signRes.json()) as { chunkId: string; bucket: string; path: string; token: string };

    const supabase = createSupabaseBrowserClient();
    const { error: upErr } = await supabase.storage
      .from(signJson.bucket)
      .uploadToSignedUrl(signJson.path, signJson.token, blob, { contentType: mimeType });
    if (upErr) throw new Error(`Chunk upload failed: ${upErr.message}`);

    const doneRes = await fetch(`/api/meetings/${meetingId}/chunks/uploaded`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chunkId: signJson.chunkId,
        sizeBytes: blob.size,
      }),
    });
    if (!doneRes.ok) throw new Error(await doneRes.text());

    setUploadedChunks((n) => n + 1);
  }, []);

  const enqueueUpload = useCallback(
    (blob: Blob, seq: number) => {
      uploadQueueRef.current = uploadQueueRef.current.then(async () => {
        try {
          await uploadChunk(blob, seq);
        } catch (e: unknown) {
          uploadErrorRef.current = errorMessage(e) || "Chunk upload failed.";
        }
      });
      return uploadQueueRef.current;
    },
    [uploadChunk],
  );

  const start = useCallback(async () => {
    setError("");
    setSeconds(0);
    setUploadedChunks(0);
    startedAtRef.current = Date.now();
    seqRef.current = 0;
    totalBytesRef.current = 0;
    uploadErrorRef.current = "";
    uploadQueueRef.current = Promise.resolve();

    try {
      // Initialize meeting immediately so chunks can stream to storage.
      const initRes = await fetch("/api/meetings/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startedAtMs: startedAtRef.current }),
      });
      if (!initRes.ok) throw new Error(await initRes.text());
      const initJson = (await initRes.json()) as { id: string };
      meetingIdRef.current = initJson.id;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      if (typeof MediaRecorder === "undefined") throw new Error("MediaRecorder is not supported in this browser.");

      const mimeType = chooseMimeType();
      mimeTypeRef.current = mimeType || "audio/webm";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (!e.data || e.data.size === 0) return;
        const seq = seqRef.current;
        seqRef.current += 1;
        void enqueueUpload(e.data, seq);
      };

      // 60s chunks reduce total processing overhead for long meetings.
      recorder.start(CHUNK_MS);
      setState("recording");
    } catch (e: unknown) {
      setState("error");
      setError(errorMessage(e) || "Microphone permission failed.");
      await stopInternal();
    }
  }, [chooseMimeType, enqueueUpload, stopInternal]);

  const stop = useCallback(async () => {
    setState("uploading");
    try {
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== "inactive") {
        await new Promise<void>((resolve) => {
          rec.addEventListener("stop", () => resolve(), { once: true });
          rec.stop();
        });
      }
      await stopInternal();

      await uploadQueueRef.current;
      if (uploadErrorRef.current) throw new Error(uploadErrorRef.current);

      const meetingId = meetingIdRef.current;
      if (!meetingId) throw new Error("Missing meeting id");

      const finRes = await fetch(`/api/meetings/${meetingId}/uploaded`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endedAtMs: Date.now(),
          durationSeconds: seconds,
          totalBytes: totalBytesRef.current,
          mimeType: mimeTypeRef.current || "audio/webm",
        }),
      });
      if (!finRes.ok) throw new Error(await finRes.text());

      setState("processing");
      // Kick processing once; meeting page will continue polling.
      void fetch(`/api/meetings/${meetingId}/process`, { method: "POST" }).catch(() => {
        // Meeting page polling will continue processing even if this warm-up request fails.
      });

      router.push(`/meetings/${meetingId}`);
      router.refresh();
    } catch (e: unknown) {
      setState("error");
      setError(errorMessage(e) || "Upload/processing failed.");
    }
  }, [router, seconds, stopInternal]);

  const badge = useMemo(() => {
    if (state === "recording") return "Recording";
    if (state === "uploading") return "Uploading";
    if (state === "processing") return "Processing";
    if (state === "error") return "Error";
    return "Ready";
  }, [state]);

  return (
    <section className="rounded-2xl border border-black/10 bg-white/70 p-5 shadow-sm backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium tracking-wide text-black/60">{badge}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">{formatTime(seconds)}</div>
          <div className="mt-1 text-sm text-black/60">Live chunk upload is enabled for long meetings. Uploaded chunks: {uploadedChunks}</div>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void start()}
            disabled={!canStart}
          >
            Start
          </button>
          <button
            className="rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void stop()}
            disabled={!canStop}
          >
            Stop
          </button>
        </div>
      </div>
      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}{" "}
          <button className="ml-2 underline" onClick={reset}>
            Reset
          </button>
        </div>
      ) : null}
    </section>
  );
}
