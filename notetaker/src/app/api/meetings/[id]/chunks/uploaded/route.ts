import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  chunkId: z.string().uuid(),
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
  const { error } = await admin
    .from("meeting_chunks")
    .update({
      status: "uploaded",
      audio_size_bytes: body.data.sizeBytes ?? null,
      error: null,
    })
    .eq("id", body.data.chunkId)
    .eq("meeting_id", id)
    .eq("user_id", user.id);
  if (error) return new NextResponse(error.message, { status: 500 });

  return NextResponse.json({ ok: true });
}

