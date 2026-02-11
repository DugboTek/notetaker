import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uploadToGeminiFiles } from "@/lib/gemini/files";
import { geminiGenerateJson } from "@/lib/gemini/generate";
import { MEETING_EXTRACT_SCHEMA, meetingExtractPrompt } from "@/lib/gemini/prompts";

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
    .select("id, user_id, audio_bucket, audio_path, audio_mime, title")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!meeting) return new NextResponse("Not found", { status: 404 });
  if (!meeting.audio_bucket || !meeting.audio_path) return new NextResponse("Missing audio", { status: 400 });

  await admin.from("meetings").update({ status: "processing", error: null }).eq("id", meeting.id);

  try {
    const dl = await admin.storage.from(meeting.audio_bucket).download(meeting.audio_path);
    if (dl.error || !dl.data) throw new Error(dl.error?.message ?? "Failed to download audio");

    const blob = dl.data as Blob;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const mimeType = meeting.audio_mime || "application/octet-stream";

    const file = await uploadToGeminiFiles({
      bytes,
      mimeType,
      displayName: `${meeting.id}.wav`,
    });

    const jsonText = await geminiGenerateJson({
      model: MODEL,
      schema: MEETING_EXTRACT_SCHEMA,
      parts: [
        { text: meetingExtractPrompt() },
        { file_data: { file_uri: file.uri, mime_type: mimeType } },
      ],
      temperature: 0.1,
    });

    const parsed = JSON.parse(jsonText) as MeetingExtract;

    const title = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : meeting.title;
    const summary = typeof parsed.summary === "string" ? parsed.summary : null;
    const transcriptText = typeof parsed.transcriptText === "string" ? parsed.transcriptText : null;
    const actionItems = Array.isArray(parsed.actionItems) ? parsed.actionItems : [];
    const decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
    const keyTopics = Array.isArray(parsed.keyTopics) ? parsed.keyTopics : [];

    await admin
      .from("meetings")
      .update({
        title,
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
      .eq("id", meeting.id);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Processing failed.";
    await admin.from("meetings").update({ status: "error", error: msg, model: MODEL }).eq("id", meeting.id);
    return new NextResponse(msg, { status: 500 });
  }
}
