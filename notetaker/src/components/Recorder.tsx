"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage } from "@/lib/errors";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type RecorderState = "idle" | "recording" | "uploading" | "processing" | "error";

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

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeTypeRef = useRef<string>("audio/webm");
  const startedAtRef = useRef<number>(0);

  const canStart = state === "idle" || state === "error";
  const canStop = state === "recording";

  useEffect(() => {
    if (state !== "recording") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  const reset = useCallback(() => {
    setSeconds(0);
    setError("");
    setState("idle");
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

  const chooseMimeType = useCallback(() => {
    // Prefer Opus-in-webm when available (small uploads).
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
    for (const c of candidates) {
      if (typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(c)) {
        return c;
      }
    }
    return "";
  }, []);

  const start = useCallback(async () => {
    setError("");
    setSeconds(0);
    chunksRef.current = [];
    startedAtRef.current = Date.now();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      if (typeof MediaRecorder === "undefined") throw new Error("MediaRecorder is not supported in this browser.");

      const mimeType = chooseMimeType();
      mimeTypeRef.current = mimeType || "audio/webm";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(1000);
      setState("recording");
    } catch (e: unknown) {
      setState("error");
      setError(errorMessage(e) || "Microphone permission failed.");
      await stopInternal();
    }
  }, [chooseMimeType, stopInternal]);

  const stop = useCallback(async () => {
    setState("uploading");
    try {
      // Stop and wait for final chunk flush.
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== "inactive") {
        await new Promise<void>((resolve) => {
          const onStop = () => resolve();
          rec.addEventListener("stop", onStop, { once: true });
          rec.stop();
        });
      }
      await stopInternal();

      const mimeType = mimeTypeRef.current || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: mimeType });

      // 1) Init upload (small JSON). Server returns a signed upload token.
      const initRes = await fetch("/api/meetings/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startedAtMs: startedAtRef.current,
          endedAtMs: Date.now(),
          durationSeconds: seconds,
          mimeType,
          sizeBytes: blob.size,
        }),
      });
      if (!initRes.ok) throw new Error(await initRes.text());
      const initJson = (await initRes.json()) as { id: string; bucket: string; path: string; token: string };

      // 2) Upload directly to Supabase Storage (avoids Vercel payload limits).
      const supabase = createSupabaseBrowserClient();
      const { error: upErr } = await supabase.storage
        .from(initJson.bucket)
        .uploadToSignedUrl(initJson.path, initJson.token, blob, { contentType: mimeType });
      if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

      // 3) Mark uploaded, then process.
      const finRes = await fetch(`/api/meetings/${initJson.id}/uploaded`, { method: "POST" });
      if (!finRes.ok) throw new Error(await finRes.text());

      setState("processing");
      const procRes = await fetch(`/api/meetings/${initJson.id}/process`, { method: "POST" });
      if (!procRes.ok) throw new Error(await procRes.text());

      router.push(`/meetings/${initJson.id}`);
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
          <div className="mt-1 text-sm text-black/60">Record a meeting from your phone mic. Keep this tab open while recording.</div>
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

