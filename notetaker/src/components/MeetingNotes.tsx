import type { ReactNode } from "react";

function section(title: string, body: ReactNode) {
  return (
    <section className="rounded-2xl border border-black/10 bg-white/70 p-5 shadow-sm backdrop-blur">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 text-sm leading-6 text-black/80">{body}</div>
    </section>
  );
}

export function MeetingNotes(props: {
  title?: string | null;
  summary?: string | null;
  actionItems?: Array<{ task: string; owner?: string | null; due?: string | null }> | null;
  decisions?: string[] | null;
  keyTopics?: string[] | null;
}) {
  const summary = (props.summary ?? "").trim();
  const action = props.actionItems ?? [];
  const decisions = props.decisions ?? [];
  const topics = props.keyTopics ?? [];

  return (
    <div className="space-y-4">
      {section(
        "Summary",
        summary ? <div className="whitespace-pre-wrap">{summary}</div> : <div className="text-black/50">No summary yet.</div>,
      )}
      {section(
        "Action Items",
        action.length ? (
          <ul className="list-disc pl-5">
            {action.map((a, i) => (
              <li key={i}>
                <span className="font-medium">{a.task}</span>
                {a.owner ? <span className="text-black/60"> (Owner: {a.owner})</span> : null}
                {a.due ? <span className="text-black/60"> (Due: {a.due})</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-black/50">No action items yet.</div>
        ),
      )}
      {section(
        "Decisions",
        decisions.length ? (
          <ul className="list-disc pl-5">
            {decisions.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        ) : (
          <div className="text-black/50">No decisions yet.</div>
        ),
      )}
      {section(
        "Key Topics",
        topics.length ? (
          <ul className="list-disc pl-5">
            {topics.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        ) : (
          <div className="text-black/50">No topics yet.</div>
        ),
      )}
    </div>
  );
}

