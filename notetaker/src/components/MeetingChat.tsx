"use client";

import { useMemo, useState } from "react";
import { errorMessage } from "@/lib/errors";

export type MeetingChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export function MeetingChat(props: { meetingId: string; initial: MeetingChatMessage[] }) {
  const [messages, setMessages] = useState<MeetingChatMessage[]>(props.initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canSend = text.trim().length > 0 && !busy;

  const last = useMemo(() => messages[messages.length - 1], [messages]);

  async function send() {
    const msg = text.trim();
    if (!msg) return;
    setError("");
    setBusy(true);
    setText("");

    const optimistic: MeetingChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: msg,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);

    try {
      const res = await fetch(`/api/meetings/${props.meetingId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { assistant: MeetingChatMessage };
      setMessages((m) => [...m.filter((x) => x.id !== optimistic.id), optimistic, data.assistant]);
    } catch (e: unknown) {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setError(errorMessage(e) || "Chat failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-black/10 bg-white/70 p-5 shadow-sm backdrop-blur">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold tracking-tight">Chat</h2>
        <div className="text-xs text-black/50">{busy ? "Thinking…" : last ? `Last: ${last.role}` : "Ask a question"}</div>
      </div>

      <div className="mt-4 max-h-[42vh] space-y-3 overflow-auto pr-1">
        {messages.length === 0 ? (
          <div className="text-sm text-black/60">No messages yet.</div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={[
                "rounded-2xl px-4 py-3 text-sm leading-6",
                m.role === "user" ? "ml-10 bg-black text-white" : "mr-10 bg-white text-black border border-black/10",
              ].join(" ")}
            >
              {m.content}
            </div>
          ))
        )}
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="mt-4 flex gap-2">
        <input
          className="w-full rounded-full border border-black/15 bg-white px-4 py-2 text-sm outline-none focus:border-black/30"
          value={text}
          placeholder="What did we decide about timelines?"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void send();
          }}
          disabled={busy}
        />
        <button
          className="shrink-0 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          onClick={() => void send()}
          disabled={!canSend}
        >
          Send
        </button>
      </div>
    </section>
  );
}
