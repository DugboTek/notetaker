import { getGeminiEnv } from "@/lib/env";

type GenerateContentResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

export async function geminiGenerateText(opts: {
  model: string;
  parts: Array<{ text?: string; file_data?: { file_uri: string; mime_type: string } }>;
  temperature?: number;
}) {
  const { GEMINI_API_KEY } = getGeminiEnv();

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": GEMINI_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: opts.parts }],
      generationConfig: {
        temperature: opts.temperature ?? 0.4,
      },
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini generateContent failed (${res.status}): ${txt}`);
  }

  const data = (await res.json()) as GenerateContentResponse;
  const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!txt) throw new Error("Gemini returned no text");
  return txt;
}

export async function geminiGenerateJson(opts: {
  model: string;
  schema: unknown;
  parts: Array<{ text?: string; file_data?: { file_uri: string; mime_type: string } }>;
  temperature?: number;
}) {
  const { GEMINI_API_KEY } = getGeminiEnv();

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": GEMINI_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: opts.parts }],
      generationConfig: {
        temperature: opts.temperature ?? 0.2,
        responseMimeType: "application/json",
        responseJsonSchema: opts.schema,
      },
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini generateContent failed (${res.status}): ${txt}`);
  }

  const data = (await res.json()) as GenerateContentResponse;
  const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!txt) throw new Error("Gemini returned no text");
  return txt;
}
