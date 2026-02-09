"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { encodeWav16kMono } from "@/lib/wav";
import { errorMessage } from "@/lib/errors";

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
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef<number>(48000);
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
    processorRef.current?.disconnect();
    processorRef.current = null;

    audioContextRef.current?.close();
    audioContextRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError("");
    setSeconds(0);
    chunksRef.current = [];
    startedAtRef.current = Date.now();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextCtor) throw new Error("AudioContext is not supported in this browser.");
      const audioContext = new AudioContextCtor();
      audioContextRef.current = audioContext;
      sampleRateRef.current = audioContext.sampleRate;

      // ScriptProcessorNode is deprecated but still broadly supported; good enough for an MVP.
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(processor);
      processor.connect(audioContext.destination);

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(input));
      };

      // iOS Safari sometimes starts suspended.
      if (audioContext.state === "suspended") await audioContext.resume();

      setState("recording");
    } catch (e: unknown) {
      setState("error");
      setError(errorMessage(e) || "Microphone permission failed.");
      await stopInternal();
    }
  }, [stopInternal]);

  const stop = useCallback(async () => {
    setState("uploading");
    try {
      await stopInternal();

      const chunks = chunksRef.current;
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const merged = new Float32Array(total);
      let off = 0;
      for (const c of chunks) {
        merged.set(c, off);
        off += c.length;
      }

      const wavBytes = encodeWav16kMono(merged, sampleRateRef.current);
      const blob = new Blob([wavBytes], { type: "audio/wav" });

      const form = new FormData();
      form.append("audio", blob, `meeting-${new Date().toISOString()}.wav`);
      form.append("startedAtMs", String(startedAtRef.current));
      form.append("endedAtMs", String(Date.now()));
      form.append("durationSeconds", String(seconds));

      const uploadRes = await fetch("/api/meetings/upload", { method: "POST", body: form });
      if (!uploadRes.ok) throw new Error(await uploadRes.text());
      const uploadJson = (await uploadRes.json()) as { id: string };

      setState("processing");
      const procRes = await fetch(`/api/meetings/${uploadJson.id}/process`, { method: "POST" });
      if (!procRes.ok) throw new Error(await procRes.text());

      router.push(`/meetings/${uploadJson.id}`);
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
          <div className="mt-1 text-sm text-black/60">
            Record a meeting from your phone mic. Keep this tab open while recording.
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            onClick={start}
            disabled={!canStart}
          >
            Start
          </button>
          <button
            className="rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
            onClick={stop}
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
