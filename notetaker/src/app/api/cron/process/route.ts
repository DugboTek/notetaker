import { NextResponse } from "next/server";
import { getCronConfig, isCronAuthorized } from "@/lib/cron";
import { processMeetingById } from "@/lib/meeting-processing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new NextResponse("Unauthorized", { status: 401 });

  const { meetingBatchSize } = getCronConfig();
  const admin = createSupabaseAdminClient();

  const { data: meetings, error } = await admin
    .from("meetings")
    .select("id, status, created_at")
    .in("status", ["uploaded", "processing"])
    .order("created_at", { ascending: true })
    .limit(meetingBatchSize);

  if (error) return new NextResponse(error.message, { status: 500 });

  const items = meetings ?? [];
  let ready = 0;
  let processing = 0;
  let failed = 0;
  const results: Array<{ id: string; status: string; message?: string }> = [];

  for (const meeting of items) {
    try {
      const out = await processMeetingById({ meetingId: String(meeting.id) });
      if (out.status === "ready") ready += 1;
      else processing += 1;
      results.push({ id: String(meeting.id), status: out.status });
    } catch (e: unknown) {
      failed += 1;
      results.push({
        id: String(meeting.id),
        status: "error",
        message: e instanceof Error ? e.message : "Processing failed.",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    processedMeetings: items.length,
    ready,
    processing,
    failed,
    results,
  });
}
