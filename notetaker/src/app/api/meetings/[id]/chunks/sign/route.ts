import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { extForMime } from "@/lib/audio";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  seq: z.number().int().nonnegative(),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative().optional(),
});

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
    .select("id, user_id, audio_bucket")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!meeting) return new NextResponse("Not found", { status: 404 });

  const ext = extForMime(body.data.mimeType);
  const path = `${user.id}/${meeting.id}/chunks/${String(body.data.seq).padStart(6, "0")}.${ext}`;

  const { data: upserted, error: chunkErr } = await admin
    .from("meeting_chunks")
    .upsert(
      {
        meeting_id: meeting.id,
        user_id: user.id,
        seq: body.data.seq,
        audio_bucket: meeting.audio_bucket,
        audio_path: path,
        audio_mime: body.data.mimeType,
        audio_size_bytes: body.data.sizeBytes ?? null,
        status: "uploading",
        error: null,
      },
      { onConflict: "meeting_id,seq" },
    )
    .select("id, audio_bucket, audio_path")
    .single();
  if (chunkErr || !upserted) return new NextResponse(chunkErr?.message ?? "Failed to register chunk", { status: 500 });

  const { data: signed, error: signErr } = await admin.storage.from(upserted.audio_bucket).createSignedUploadUrl(upserted.audio_path, { upsert: true });
  if (signErr || !signed) {
    await admin.from("meeting_chunks").update({ status: "error", error: `Signed URL failed: ${signErr?.message ?? "unknown"}` }).eq("id", upserted.id);
    return new NextResponse(signErr?.message ?? "Signed URL failed", { status: 500 });
  }

  return NextResponse.json({
    chunkId: upserted.id,
    bucket: upserted.audio_bucket,
    path: signed.path,
    token: signed.token,
  });
}

