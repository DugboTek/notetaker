import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { geminiGenerateText } from "@/lib/gemini/generate";
import { meetingChatSystemPrompt } from "@/lib/gemini/prompts";
import { errorMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = "gemini-3-flash-preview";

const bodySchema = z.object({
  message: z.string().min(1).max(4000),
});

type SummaryJson = { summary?: string | null } | null;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return new NextResponse("Invalid body", { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: meeting } = await admin
    .from("meetings")
    .select("id, transcript_text, summary_json")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!meeting) return new NextResponse("Not found", { status: 404 });

  const summaryJson = meeting.summary_json as SummaryJson;
  const summary =
    summaryJson && typeof summaryJson === "object" && "summary" in summaryJson && typeof summaryJson.summary === "string"
      ? summaryJson.summary
      : "";
  const transcriptText = meeting.transcript_text ?? "";

  const { data: userMsg, error: insErr } = await admin
    .from("meeting_messages")
    .insert({ meeting_id: id, user_id: user.id, role: "user", content: body.data.message })
    .select("id, role, content, created_at")
    .single();
  if (insErr) return new NextResponse(insErr.message, { status: 500 });

  try {
    const system = meetingChatSystemPrompt({ summary, transcriptText });
    const answer = await geminiGenerateText({
      model: MODEL,
      parts: [{ text: `${system}\n\nUSER QUESTION:\n${body.data.message}` }],
      temperature: 0.3,
    });

    const { data: assistantMsg, error: asErr } = await admin
      .from("meeting_messages")
      .insert({ meeting_id: id, user_id: user.id, role: "assistant", content: answer })
      .select("id, role, content, created_at")
      .single();
    if (asErr) return new NextResponse(asErr.message, { status: 500 });

    return NextResponse.json({ user: userMsg, assistant: assistantMsg });
  } catch (e: unknown) {
    return new NextResponse(errorMessage(e) || "Chat failed", { status: 500 });
  }
}
