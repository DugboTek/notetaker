import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("meetings").update({ status: "uploaded", error: null }).eq("id", id).eq("user_id", user.id);
  if (error) return new NextResponse(error.message, { status: 500 });

  return NextResponse.json({ ok: true });
}

