import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  endedAtMs: z.number().optional(),
  durationSeconds: z.number().optional(),
  totalBytes: z.number().optional(),
  mimeType: z.string().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const body = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return new NextResponse("Invalid body", { status: 400 });

  const admin = createSupabaseAdminClient();
  const endedAt = body.data.endedAtMs ? new Date(body.data.endedAtMs).toISOString() : null;

  const { error } = await admin
    .from("meetings")
    .update({
      status: "uploaded",
      ended_at: endedAt,
      duration_seconds: body.data.durationSeconds ?? null,
      audio_size_bytes: body.data.totalBytes ?? null,
      audio_mime: body.data.mimeType ?? null,
      error: null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return new NextResponse(error.message, { status: 500 });

  return NextResponse.json({ ok: true });
}
