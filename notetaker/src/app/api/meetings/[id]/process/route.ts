import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uploadToGeminiFiles } from "@/lib/gemini/files";
import { geminiGenerateJson, geminiGenerateText } from "@/lib/gemini/generate";
import {
  chunkTranscribePrompt,
  MEETING_EXTRACT_SCHEMA,
  MEETING_SUMMARY_SCHEMA,
  meetingExtractPrompt,
  meetingSummaryFromTranscriptPrompt,
} from "@/lib/gemini/prompts";

export const runtime = "nodejs";
export const maxDuration = 300;

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

type ChunkRow = {
  id: string;
  seq: number;
  audio_bucket: string;
  audio_path: string;
  audio_mime: string | null;
  status: string;
  transcript_text: string | null;
};

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
  await admin.from("meeting_chunks").update({ status: "processed", transcript_text: clean, error: null }).eq("id", chunk.id);
  return clean;
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

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: meeting } = await admin
    .from("meetings")
    .select("id, user_id, audio_bucket, audio_path, audio_mime, title, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!meeting) return new NextResponse("Not found", { status: 404 });

  if (meeting.status === "ready") {
    return NextResponse.json({ status: "ready" });
  }

  await admin.from("meetings").update({ status: "processing", error: null }).eq("id", meeting.id);

  try {
    const { data: chunks, error: chunksErr } = await admin
      .from("meeting_chunks")
      .select("id, seq, audio_bucket, audio_path, audio_mime, status, transcript_text")
      .eq("meeting_id", meeting.id)
      .eq("user_id", user.id)
      .order("seq", { ascending: true });
    if (chunksErr) throw new Error(chunksErr.message);

    const chunkRows = (chunks ?? []) as ChunkRow[];
    if (chunkRows.length > 0) {
      const waiting = chunkRows.filter((c) => c.status === "uploading").length;
      if (waiting > 0) {
        return NextResponse.json({ status: "processing", waitingUploads: waiting });
      }

      const next = chunkRows.find((c) => c.status === "uploaded" && !c.transcript_text);
      if (next) {
        await transcribeChunk(admin, next, meeting.id);
        const remaining = chunkRows.filter((c) => c.id !== next.id && c.status === "uploaded" && !c.transcript_text).length;
        return NextResponse.json({ status: "processing", processedChunkSeq: next.seq, remainingChunks: remaining });
      }

      const hasErrors = chunkRows.some((c) => c.status === "error");
      if (hasErrors) throw new Error("One or more chunks failed to upload/process");

      await finalizeFromChunkTranscripts({
        admin,
        meetingId: meeting.id,
        title: meeting.title,
      });
      return NextResponse.json({ status: "ready" });
    }

    if (!meeting.audio_bucket || !meeting.audio_path) {
      return NextResponse.json({ status: "processing", waitingUploads: 1 });
    }

    await processSingleFile({
      admin,
      meetingId: meeting.id,
      title: meeting.title,
      audioBucket: meeting.audio_bucket,
      audioPath: meeting.audio_path,
      audioMime: meeting.audio_mime,
    });
    return NextResponse.json({ status: "ready" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Processing failed.";
    await admin.from("meetings").update({ status: "error", error: msg, model: MODEL }).eq("id", meeting.id);
    return new NextResponse(msg, { status: 500 });
  }
}

