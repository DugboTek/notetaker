import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppEnv } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  startedAtMs: z.number().optional(),
});

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return new NextResponse("Invalid body", { status: 400 });

  const startedAt = body.data.startedAtMs ? new Date(body.data.startedAtMs).toISOString() : null;
  const admin = createSupabaseAdminClient();
  const { MEETING_AUDIO_BUCKET: bucket } = getAppEnv();

  // Ensure the bucket exists (first-run convenience).
  const { data: buckets, error: listErr } = await admin.storage.listBuckets();
  if (listErr) return new NextResponse(`Storage error: ${listErr.message}`, { status: 500 });
  if (!buckets?.some((b) => b.name === bucket)) {
    const { error: createErr } = await admin.storage.createBucket(bucket, { public: false });
    if (createErr && !/already exists/i.test(createErr.message)) {
      return new NextResponse(`Bucket create failed: ${createErr.message}`, { status: 500 });
    }
  }

  const title = `Meeting ${new Date().toLocaleDateString()}`;
  const { data: inserted, error: insErr } = await admin
    .from("meetings")
    .insert({
      user_id: user.id,
      title,
      status: "recording",
      started_at: startedAt,
      audio_bucket: bucket,
      error: null,
    })
    .select("id, audio_bucket")
    .single();

  if (insErr || !inserted) return new NextResponse(insErr?.message ?? "Failed to create meeting", { status: 500 });

  return NextResponse.json({ id: inserted.id, bucket: inserted.audio_bucket });
}

