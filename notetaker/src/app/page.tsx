import Link from "next/link";
import { redirect } from "next/navigation";
import { Recorder } from "@/components/Recorder";
import { SignOutButton } from "@/components/SignOutButton";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createSupabaseAdminClient();
  const { data: meetings } = await admin
    .from("meetings")
    .select("id, created_at, title, status, duration_seconds")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div>
          <div className="text-xs font-semibold tracking-wide text-black/60">Notetaker</div>
          <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
          <div className="mt-1 text-sm text-black/60">Signed in as {user.email}</div>
        </div>
        <SignOutButton />
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 pb-12">
        <Recorder />

        <section className="rounded-2xl border border-black/10 bg-white/70 p-5 shadow-sm backdrop-blur">
          <h2 className="text-base font-semibold tracking-tight">Recent</h2>
          <div className="mt-3 space-y-2">
            {meetings?.length ? (
              meetings.map((m) => (
                <Link
                  key={m.id}
                  href={`/meetings/${m.id}`}
                  className="flex items-center justify-between rounded-xl border border-black/10 bg-white px-4 py-3 text-sm hover:border-black/20"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{m.title || "Untitled meeting"}</div>
                    <div className="mt-0.5 text-xs text-black/50">
                      {new Date(m.created_at).toLocaleString()} · {m.status}
                      {typeof m.duration_seconds === "number" ? ` · ${m.duration_seconds}s` : ""}
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-black/60">Open</div>
                </Link>
              ))
            ) : (
              <div className="text-sm text-black/60">No meetings yet. Record one above.</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
