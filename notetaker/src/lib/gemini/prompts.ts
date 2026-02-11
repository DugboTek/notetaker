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

export const MEETING_SUMMARY_SCHEMA = {
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
  },
  required: ["summary", "actionItems"],
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

export function chunkTranscribePrompt() {
  return [
    "Transcribe this meeting audio chunk.",
    "Rules:",
    "- Return plain text transcript only.",
    "- Keep speaker changes readable if obvious.",
    "- Use [inaudible] where speech is unclear.",
    "- Do not add summaries or commentary.",
  ].join("\n");
}

export function meetingSummaryFromTranscriptPrompt(transcriptText: string) {
  const clipped = transcriptText.length > 80000 ? transcriptText.slice(0, 80000) + "\n\n[Transcript truncated]" : transcriptText;
  return [
    "You are a meeting assistant.",
    "Given the transcript below, generate structured notes as JSON matching the provided schema.",
    "Do not invent facts not present in transcript.",
    "",
    "TRANSCRIPT:",
    clipped || "(none)",
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
