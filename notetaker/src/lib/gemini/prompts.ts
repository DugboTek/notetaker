export const MEETING_EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    keyTopics: { type: "array", items: { type: "string" } },
    decisions: { type: "array", items: { type: "string" } },
    actionItems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          task: { type: "string" },
          owner: { type: "string" },
          due: { type: "string" },
        },
        required: ["task"],
      },
    },
    transcriptText: { type: "string" },
  },
  required: ["summary", "actionItems", "transcriptText"],
} as const;

export function meetingExtractPrompt() {
  return [
    "Transcribe this meeting audio and produce structured meeting notes.",
    "Requirements:",
    "- Transcript: produce a clean, readable transcript in `transcriptText`.",
    "- Summary: crisp, 5-12 bullet lines in paragraph form (not a giant wall of text).",
    "- Action items: concrete tasks with an owner if identifiable.",
    "- If a portion is unclear, mark it as [inaudible]. Do not invent names or facts.",
    "- Keep the output strictly valid JSON matching the provided schema.",
  ].join("\n");
}

export function meetingChatSystemPrompt(opts: { summary?: string; transcriptText?: string }) {
  const summary = (opts.summary ?? "").trim();
  const transcript = (opts.transcriptText ?? "").trim();

  // Keep context bounded; prefer summary if transcript is huge.
  const transcriptSnippet = transcript.length > 12000 ? transcript.slice(0, 12000) + "\n\n[Transcript truncated]" : transcript;

  return [
    "You are a meeting assistant. Answer questions based on the meeting content only.",
    "If the answer isn't in the meeting, say so plainly.",
    "",
    "MEETING SUMMARY:",
    summary || "(none)",
    "",
    "MEETING TRANSCRIPT:",
    transcriptSnippet || "(none)",
  ].join("\n");
}
