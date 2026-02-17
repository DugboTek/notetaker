import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { uploadToGeminiFiles } from "@/lib/gemini/files";
import { geminiGenerateJson, geminiGenerateText } from "@/lib/gemini/generate";
import { computeChunkProgress, getProcessingConfig, mapWithConcurrency } from "@/lib/processing";
import {
  chunkTranscribePrompt,
  MEETING_EXTRACT_SCHEMA,
  MEETING_SUMMARY_SCHEMA,
  meetingExtractPrompt,
  meetingSummaryFromTranscriptPrompt,
} from "@/lib/gemini/prompts";

const MODEL = "gemini-3-flash-preview";

type MeetingExtract = {
  title?: string;
  summary: string;
  keyTopics?: string[];
  decisions?: string[];
  actionItems: Array<{ task: string; owner?: string; due?: string }>;
  transcriptText: string;
};

type MeetingSummary = {
  title?: string;
  summary: string;
  keyTopics?: string[];
  decisions?: string[];
  actionItems: Array<{ task: string; owner?: string; due?: string }>;
};

type MeetingRow = {
  id: string;
  user_id: string;
  audio_bucket: string;
  audio_path: string | null;
  audio_mime: string | null;
  title: string | null;
  status: string;
};

type ChunkRow = {
  id: string;
  seq: number;
  audio_bucket: string;
  audio_path: string;
  audio_mime: string | null;
  status: string;
  transcript_text: string | null;
  error: string | null;
};

export type ProcessMeetingResult = {
  status: "ready" | "processing";
  waitingUploads?: number;
  processedChunkSeq?: number | null;
  processedChunks?: number;
  totalChunks?: number;
  remainingChunks?: number;
  shouldContinue?: boolean;
  processedThisRun?: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryCount(raw: string | null) {
  if (!raw) return 0;
  const match = /^retry:(\d+)\|/i.exec(raw);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function stripRetryPrefix(raw: string | null) {
  if (!raw) return "";
  const match = /^retry:\d+\|([\s\S]*)$/i.exec(raw);
  return (match?.[1] ?? raw).trim();
}

async function transcribeChunk(admin: ReturnType<typeof createSupabaseAdminClient>, chunk: ChunkRow, meetingId: string) {
  const dl = await admin.storage.from(chunk.audio_bucket).download(chunk.audio_path);
  if (dl.error || !dl.data) throw new Error(dl.error?.message ?? "Failed to download chunk");

  const blob = dl.data as Blob;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mimeType = chunk.audio_mime || "application/octet-stream";

  const file = await uploadToGeminiFiles({
    bytes,
    mimeType,
    displayName: `${meetingId}-chunk-${chunk.seq}`,
  });

  const transcript = await geminiGenerateText({
    model: MODEL,
    parts: [{ text: chunkTranscribePrompt() }, { file_data: { file_uri: file.uri, mime_type: mimeType } }],
    temperature: 0.1,
  });

  const clean = transcript.trim();
  const { error: updateErr } = await admin
    .from("meeting_chunks")
    .update({ status: "processed", transcript_text: clean, error: null })
    .eq("id", chunk.id);
  if (updateErr) throw new Error(updateErr.message);
  return clean;
}

async function claimChunksForProcessing(opts: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  meetingId: string;
  userId: string;
  limit: number;
  concurrency: number;
}) {
  const { admin, meetingId, userId, limit, concurrency } = opts;
  if (limit <= 0) return [] as ChunkRow[];

  const { data: candidates, error: listErr } = await admin
    .from("meeting_chunks")
    .select("id, seq, audio_bucket, audio_path, audio_mime, status, transcript_text, error")
    .eq("meeting_id", meetingId)
    .eq("user_id", userId)
    .eq("status", "uploaded")
    .is("transcript_text", null)
    .order("seq", { ascending: true })
    .limit(Math.max(limit, concurrency) * 3);

  if (listErr) throw new Error(listErr.message);
  const rows = (candidates ?? []) as ChunkRow[];
  if (rows.length === 0) return [] as ChunkRow[];

  const claimedOrNull = await mapWithConcurrency(rows, Math.max(1, concurrency), async (candidate) => {
    const { data: claimed, error: claimErr } = await admin
      .from("meeting_chunks")
      .update({ status: "processing" })
      .eq("id", candidate.id)
      .eq("status", "uploaded")
      .is("transcript_text", null)
      .select("id, seq, audio_bucket, audio_path, audio_mime, status, transcript_text, error")
      .maybeSingle();

    if (claimErr) throw new Error(claimErr.message);
    return (claimed ?? null) as ChunkRow | null;
  });

  return claimedOrNull.filter((row): row is ChunkRow => row !== null).slice(0, limit);
}

async function finalizeFromChunkTranscripts(opts: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  meetingId: string;
  title: string | null;
}) {
  const { admin, meetingId, title } = opts;
  const { data: chunks, error: chunksErr } = await admin
    .from("meeting_chunks")
    .select("seq, transcript_text")
    .eq("meeting_id", meetingId)
    .order("seq", { ascending: true });
  if (chunksErr) throw new Error(chunksErr.message);

  const fullTranscript = (chunks ?? [])
    .map((c) => (c.transcript_text || "").trim())
    .filter((t) => t.length > 0)
    .join("\n\n");

  if (!fullTranscript) throw new Error("No transcript text found in processed chunks");

  const jsonText = await geminiGenerateJson({
    model: MODEL,
    schema: MEETING_SUMMARY_SCHEMA,
    parts: [{ text: meetingSummaryFromTranscriptPrompt(fullTranscript) }],
    temperature: 0.1,
  });
  const parsed = JSON.parse(jsonText) as MeetingSummary;

  const nextTitle = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : title;
  const summary = typeof parsed.summary === "string" ? parsed.summary : null;
  const actionItems = Array.isArray(parsed.actionItems) ? parsed.actionItems : [];
  const decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
  const keyTopics = Array.isArray(parsed.keyTopics) ? parsed.keyTopics : [];

  await admin
    .from("meetings")
    .update({
      title: nextTitle,
      status: "ready",
      transcript_text: fullTranscript,
      transcript_json: { source: "chunked", chunks: chunks?.length ?? 0 },
      summary_json: { summary },
      action_items_json: { actionItems },
      decisions_json: { decisions },
      key_topics_json: { keyTopics },
      model: MODEL,
      error: null,
    })
    .eq("id", meetingId);
}

async function processSingleFile(opts: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  meetingId: string;
  title: string | null;
  audioBucket: string;
  audioPath: string;
  audioMime: string | null;
}) {
  const { admin, meetingId, title, audioBucket, audioPath, audioMime } = opts;
  const dl = await admin.storage.from(audioBucket).download(audioPath);
  if (dl.error || !dl.data) throw new Error(dl.error?.message ?? "Failed to download audio");

  const blob = dl.data as Blob;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mimeType = audioMime || "application/octet-stream";

  const file = await uploadToGeminiFiles({
    bytes,
    mimeType,
    displayName: `${meetingId}.audio`,
  });

  const jsonText = await geminiGenerateJson({
    model: MODEL,
    schema: MEETING_EXTRACT_SCHEMA,
    parts: [{ text: meetingExtractPrompt() }, { file_data: { file_uri: file.uri, mime_type: mimeType } }],
    temperature: 0.1,
  });

  const parsed = JSON.parse(jsonText) as MeetingExtract;

  const nextTitle = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : title;
  const summary = typeof parsed.summary === "string" ? parsed.summary : null;
  const transcriptText = typeof parsed.transcriptText === "string" ? parsed.transcriptText : null;
  const actionItems = Array.isArray(parsed.actionItems) ? parsed.actionItems : [];
  const decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
  const keyTopics = Array.isArray(parsed.keyTopics) ? parsed.keyTopics : [];

  await admin
    .from("meetings")
    .update({
      title: nextTitle,
      status: "ready",
      transcript_text: transcriptText,
      transcript_json: parsed,
      summary_json: { summary },
      action_items_json: { actionItems },
      decisions_json: { decisions },
      key_topics_json: { keyTopics },
      model: MODEL,
      error: null,
    })
    .eq("id", meetingId);
}

async function getMeeting(admin: ReturnType<typeof createSupabaseAdminClient>, meetingId: string, userId?: string) {
  let query = admin
    .from("meetings")
    .select("id, user_id, audio_bucket, audio_path, audio_mime, title, status")
    .eq("id", meetingId);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data } = await query.maybeSingle();
  return (data ?? null) as MeetingRow | null;
}

export async function processMeetingById(opts: { meetingId: string; userId?: string }): Promise<ProcessMeetingResult> {
  const { meetingId, userId } = opts;
  const cfg = getProcessingConfig();
  const startedAtMs = Date.now();
  const admin = createSupabaseAdminClient();

  const meeting = await getMeeting(admin, meetingId, userId);
  if (!meeting) throw new Error("Meeting not found");

  if (meeting.status === "ready") return { status: "ready" };

  const canFinalizeChunked = meeting.status !== "recording" && meeting.status !== "uploading";
  if (meeting.status === "uploaded" || meeting.status === "processing") {
    await admin.from("meetings").update({ status: "processing", error: null }).eq("id", meeting.id);
  }

  try {
    const { data: chunkExists, error: existsErr } = await admin
      .from("meeting_chunks")
      .select("id")
      .eq("meeting_id", meeting.id)
      .eq("user_id", meeting.user_id)
      .limit(1);
    if (existsErr) throw new Error(existsErr.message);

    if ((chunkExists?.length ?? 0) > 0) {
      let processedThisRun = 0;
      let maxProcessedSeq: number | null = null;

      while (Date.now() - startedAtMs < cfg.loopBudgetMs) {
        const { data: chunks, error: chunksErr } = await admin
          .from("meeting_chunks")
          .select("id, seq, audio_bucket, audio_path, audio_mime, status, transcript_text, error")
          .eq("meeting_id", meeting.id)
          .eq("user_id", meeting.user_id)
          .order("seq", { ascending: true });
        if (chunksErr) throw new Error(chunksErr.message);

        const chunkRows = (chunks ?? []) as ChunkRow[];
        const progress = computeChunkProgress(chunkRows);

        if (progress.hasErrors) {
          const failed = chunkRows.find((c) => c.status === "error");
          const msg = failed ? `Chunk #${failed.seq} failed: ${stripRetryPrefix(failed.error) || "processing error"}` : "One or more chunks failed.";
          throw new Error(msg);
        }

        if (progress.total === 0) break;

        if (progress.queued > 0) {
          const toClaim = Math.min(progress.queued, cfg.maxChunksPerPass);
          const claimed = await claimChunksForProcessing({
            admin,
            meetingId: meeting.id,
            userId: meeting.user_id,
            limit: toClaim,
            concurrency: cfg.chunkConcurrency,
          });

          if (claimed.length > 0) {
            const outcomes = await mapWithConcurrency(claimed, cfg.chunkConcurrency, async (chunk) => {
              try {
                await transcribeChunk(admin, chunk, meeting.id);
                return { seq: chunk.seq, ok: true as const };
              } catch (e: unknown) {
                const raw = e instanceof Error ? e.message : "Chunk processing failed";
                const clean = raw.slice(0, 800);
                const nextRetry = parseRetryCount(chunk.error) + 1;
                const nextStatus = nextRetry >= 3 ? "error" : "uploaded";
                const nextError = nextStatus === "error" ? clean : `retry:${nextRetry}|${clean}`;
                await admin.from("meeting_chunks").update({ status: nextStatus, error: nextError }).eq("id", chunk.id);
                return { seq: chunk.seq, ok: false as const };
              }
            });

            const successful = outcomes.filter((o) => o.ok);
            processedThisRun += successful.length;
            if (successful.length > 0) {
              const newest = Math.max(...successful.map((o) => o.seq));
              maxProcessedSeq = typeof maxProcessedSeq === "number" ? Math.max(maxProcessedSeq, newest) : newest;
            }
            continue;
          }
        }

        if (canFinalizeChunked && progress.remaining === 0) {
          await finalizeFromChunkTranscripts({
            admin,
            meetingId: meeting.id,
            title: meeting.title,
          });
          return {
            status: "ready",
            processedThisRun,
            processedChunkSeq: maxProcessedSeq,
            totalChunks: progress.total,
            processedChunks: progress.processed,
            remainingChunks: 0,
            waitingUploads: 0,
          };
        }

        const shouldWaitForMore = progress.queued === 0 && progress.waitingUploads > 0 && Date.now() - startedAtMs < cfg.loopBudgetMs;
        if (shouldWaitForMore) {
          await sleep(cfg.idleWaitMs);
          continue;
        }

        return {
          status: "processing",
          processedThisRun,
          processedChunkSeq: maxProcessedSeq,
          totalChunks: progress.total,
          processedChunks: progress.processed,
          remainingChunks: progress.remaining,
          waitingUploads: progress.waitingUploads,
          shouldContinue: progress.queued > 0 || (canFinalizeChunked && progress.remaining === 0),
        };
      }

      const { data: finalRows, error: finalErr } = await admin
        .from("meeting_chunks")
        .select("id, seq, audio_bucket, audio_path, audio_mime, status, transcript_text, error")
        .eq("meeting_id", meeting.id)
        .eq("user_id", meeting.user_id)
        .order("seq", { ascending: true });
      if (finalErr) throw new Error(finalErr.message);
      const finalProgress = computeChunkProgress((finalRows ?? []) as ChunkRow[]);

      return {
        status: "processing",
        processedThisRun,
        processedChunkSeq: maxProcessedSeq,
        totalChunks: finalProgress.total,
        processedChunks: finalProgress.processed,
        remainingChunks: finalProgress.remaining,
        waitingUploads: finalProgress.waitingUploads,
        shouldContinue: finalProgress.queued > 0 || (canFinalizeChunked && finalProgress.remaining === 0),
      };
    }

    if (!meeting.audio_bucket || !meeting.audio_path) {
      return { status: "processing", waitingUploads: 1, shouldContinue: true };
    }

    await processSingleFile({
      admin,
      meetingId: meeting.id,
      title: meeting.title,
      audioBucket: meeting.audio_bucket,
      audioPath: meeting.audio_path,
      audioMime: meeting.audio_mime,
    });

    return { status: "ready" };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Processing failed.";
    await admin.from("meetings").update({ status: "error", error: msg, model: MODEL }).eq("id", meeting.id);
    throw new Error(msg);
  }
}
