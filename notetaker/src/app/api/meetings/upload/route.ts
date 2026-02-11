import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppEnv } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 300;

// Vercel serverless request bodies have size limits; do not proxy audio bytes through this route.
// Instead, we create a meeting row and return a signed upload token for direct-to-Supabase upload.
const bodySchema = z.object({
  startedAtMs: z.number().optional(),
  endedAtMs: z.number().optional(),
  durationSeconds: z.number().optional(),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative().optional(),
});

function extForMime(mime: string) {
  const m = mime.toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mpeg")) return "mp3";
  if (m.includes("mp4")) return "m4a";
  if (m.includes("wav")) return "wav";
  return "bin";
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return new NextResponse("Invalid body", { status: 400 });

  const startedAt = body.data.startedAtMs ? new Date(body.data.startedAtMs).toISOString() : null;
  const endedAt = body.data.endedAtMs ? new Date(body.data.endedAtMs).toISOString() : null;

  const admin = createSupabaseAdminClient();
  const title = `Meeting ${new Date().toLocaleDateString()}`;

  const { MEETING_AUDIO_BUCKET: bucket } = getAppEnv();
  const ext = extForMime(body.data.mimeType);

  const { data: inserted, error: insErr } = await admin
    .from("meetings")
    .insert({
      user_id: user.id,
      title,
      status: "uploading",
      started_at: startedAt,
      ended_at: endedAt,
      duration_seconds: body.data.durationSeconds ?? null,
      audio_bucket: bucket,
      audio_mime: body.data.mimeType,
      audio_size_bytes: body.data.sizeBytes ?? null,
    })
    .select("id")
    .single();

  if (insErr || !inserted) return new NextResponse(insErr?.message ?? "Failed to create meeting", { status: 500 });

  const path = `${user.id}/${inserted.id}.${ext}`;

  // Ensure the bucket exists (first-run convenience).
  const { data: buckets, error: listErr } = await admin.storage.listBuckets();
  if (listErr) return new NextResponse(`Storage error: ${listErr.message}`, { status: 500 });

  if (!buckets?.some((b) => b.name === bucket)) {
    const { error: createErr } = await admin.storage.createBucket(bucket, { public: false });
    if (createErr && !/already exists/i.test(createErr.message)) {
      await admin
        .from("meetings")
        .update({ status: "error", error: `Bucket create failed (${bucket}): ${createErr.message}` })
        .eq("id", inserted.id);
      return new NextResponse(`Bucket create failed: ${createErr.message}`, { status: 500 });
    }
  }

  const { data: signed, error: signErr } = await admin.storage.from(bucket).createSignedUploadUrl(path, { upsert: true });
  if (signErr || !signed) {
    await admin.from("meetings").update({ status: "error", error: `Signed upload URL failed: ${signErr?.message ?? "unknown"}` }).eq("id", inserted.id);
    return new NextResponse(`Signed upload URL failed: ${signErr?.message ?? "unknown"}`, { status: 500 });
  }

  await admin.from("meetings").update({ audio_path: path }).eq("id", inserted.id);

  return NextResponse.json({ id: inserted.id, bucket, path: signed.path, token: signed.token });
}

