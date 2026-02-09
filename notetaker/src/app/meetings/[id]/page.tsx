import Link from "next/link";
import { redirect } from "next/navigation";
import { MeetingChat, type MeetingChatMessage } from "@/components/MeetingChat";
import { MeetingNotes } from "@/components/MeetingNotes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ id: string }> };

type SummaryJson = { summary?: string | null } | null;
type ActionItem = { task: string; owner?: string | null; due?: string | null };
type ActionItemsJson = { actionItems?: ActionItem[] } | ActionItem[] | null;
type DecisionsJson = { decisions?: string[] } | string[] | null;
type KeyTopicsJson = { keyTopics?: string[] } | string[] | null;

export default async function MeetingPage(props: PageProps) {
  const { id } = await props.params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createSupabaseAdminClient();

  const { data: meeting } = await admin
    .from("meetings")
    .select(
      "id, created_at, title, status, duration_seconds, transcript_text, summary_json, action_items_json, decisions_json, key_topics_json, error",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!meeting) redirect("/");

  const { data: messages } = await admin
    .from("meeting_messages")
    .select("id, role, content, created_at")
    .eq("meeting_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(200);

  const summaryJson = meeting.summary_json as SummaryJson;
  const actionJson = meeting.action_items_json as ActionItemsJson;
  const decisionsJson = meeting.decisions_json as DecisionsJson;
  const keyTopicsJson = meeting.key_topics_json as KeyTopicsJson;

  const summary = summaryJson && typeof summaryJson === "object" && "summary" in summaryJson ? summaryJson.summary ?? null : null;
  const actionItems =
    Array.isArray(actionJson) ? actionJson : actionJson && typeof actionJson === "object" && "actionItems" in actionJson ? actionJson.actionItems ?? null : null;
  const decisions =
    Array.isArray(decisionsJson)
      ? decisionsJson
      : decisionsJson && typeof decisionsJson === "object" && "decisions" in decisionsJson
        ? decisionsJson.decisions ?? null
        : null;
  const keyTopics =
    Array.isArray(keyTopicsJson)
      ? keyTopicsJson
      : keyTopicsJson && typeof keyTopicsJson === "object" && "keyTopics" in keyTopicsJson
        ? keyTopicsJson.keyTopics ?? null
        : null;

  const initialMessages: MeetingChatMessage[] = (messages ?? []).map((m) => ({
    id: String(m.id),
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content),
    created_at: String(m.created_at),
  }));

  return (
    <div className="min-h-screen">
      <header className="mx-auto max-w-5xl px-6 py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold tracking-wide text-black/60">Meeting</div>
            <h1 className="truncate text-2xl font-semibold tracking-tight">{meeting.title || "Untitled meeting"}</h1>
            <div className="mt-1 text-sm text-black/60">
              {new Date(meeting.created_at).toLocaleString()} · {meeting.status}
              {typeof meeting.duration_seconds === "number" ? ` · ${meeting.duration_seconds}s` : ""}
            </div>
          </div>
          <Link className="rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold" href="/">
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-6 pb-12 lg:grid-cols-2">
        <div className="space-y-6">
          {meeting.error ? (
            <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
              <div className="font-semibold">Processing error</div>
              <div className="mt-2 whitespace-pre-wrap">{meeting.error}</div>
            </section>
          ) : null}

          <MeetingNotes title={meeting.title} summary={summary} actionItems={actionItems} decisions={decisions} keyTopics={keyTopics} />

          <section className="rounded-2xl border border-black/10 bg-white/70 p-5 shadow-sm backdrop-blur">
            <h2 className="text-base font-semibold tracking-tight">Transcript</h2>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-black/80">
              {meeting.transcript_text ? meeting.transcript_text : "No transcript yet."}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <MeetingChat meetingId={id} initial={initialMessages} />
        </div>
      </main>
    </div>
  );
}
