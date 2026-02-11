import { describe, expect, it } from "vitest";
import { chunkTranscribePrompt, meetingChatSystemPrompt, meetingSummaryFromTranscriptPrompt } from "./prompts";

describe("gemini prompts", () => {
  it("includes chunk-transcribe constraints", () => {
    const prompt = chunkTranscribePrompt();
    expect(prompt).toContain("Transcribe this meeting audio chunk.");
    expect(prompt).toContain("[inaudible]");
  });

  it("truncates very long transcript in summary prompt", () => {
    const transcript = "a".repeat(90_000);
    const prompt = meetingSummaryFromTranscriptPrompt(transcript);
    expect(prompt).toContain("[Transcript truncated]");
    expect(prompt.length).toBeLessThan(90_000);
  });

  it("truncates very long transcript in chat system prompt", () => {
    const transcript = "b".repeat(13_000);
    const prompt = meetingChatSystemPrompt({ summary: "summary", transcriptText: transcript });
    expect(prompt).toContain("[Transcript truncated]");
  });
});

