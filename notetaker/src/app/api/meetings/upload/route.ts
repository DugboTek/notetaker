import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppEnv } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 300;

const formSchema = z.object({
  startedAtMs: z.coerce.number().optional(),
  endedAtMs: z.coerce.number().optional(),
  durationSeconds: z.coerce.number().optional(),
});

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File)) return new NextResponse("Missing audio file", { status: 400 });

  const parsed = formSchema.safeParse({
    startedAtMs: form.get("startedAtMs"),
    endedAtMs: form.get("endedAtMs"),
    durationSeconds: form.get("durationSeconds"),
  });
  if (!parsed.success) return new NextResponse("Invalid form fields", { status: 400 });

  const startedAt = parsed.data.startedAtMs ? new Date(parsed.data.startedAtMs).toISOString() : null;
  const endedAt = parsed.data.endedAtMs ? new Date(parsed.data.endedAtMs).toISOString() : null;

  const admin = createSupabaseAdminClient();

  const title = `Meeting ${new Date().toLocaleDateString()}`;

  const { data: inserted, error: insErr } = await admin
    .from("meetings")
    .insert({
      user_id: user.id,
      title,
      status: "uploaded",
      started_at: startedAt,
      ended_at: endedAt,
      duration_seconds: parsed.data.durationSeconds ?? null,
      audio_mime: audio.type || "audio/wav",
      audio_size_bytes: audio.size,
    })
    .select("id")
    .single();

  if (insErr || !inserted) return new NextResponse(insErr?.message ?? "Failed to create meeting", { status: 500 });

  const { MEETING_AUDIO_BUCKET: bucket } = getAppEnv();
  const path = `${user.id}/${inserted.id}.wav`;
  const bytes = new Uint8Array(await audio.arrayBuffer());

  const doUpload = async () =>
    admin.storage.from(bucket).upload(path, bytes, {
      contentType: audio.type || "audio/wav",
      upsert: true,
    });

  let { error: upErr } = await doUpload();
  if (upErr && /bucket not found/i.test(upErr.message)) {
    // Single-user MVP: auto-create the bucket on first run.
    const { error: createErr } = await admin.storage.createBucket(bucket, { public: false });
    if (createErr && !/already exists/i.test(createErr.message)) {
      await admin
        .from("meetings")
        .update({ status: "error", error: `Bucket create failed (${bucket}): ${createErr.message}` })
        .eq("id", inserted.id);
      return new NextResponse(`Upload failed: ${createErr.message}`, { status: 500 });
    }
    ({ error: upErr } = await doUpload());
  }
  if (upErr) {
    await admin.from("meetings").update({ status: "error", error: `Audio upload failed: ${upErr.message}` }).eq("id", inserted.id);
    return new NextResponse(`Upload failed: ${upErr.message}`, { status: 500 });
  }

  await admin.from("meetings").update({ audio_bucket: bucket, audio_path: path }).eq("id", inserted.id);

  return NextResponse.json({ id: inserted.id });
}
