import { getGeminiEnv } from "@/lib/env";

type GeminiFile = {
  file: {
    name?: string;
    uri: string;
    mimeType?: string;
    state?: string;
  };
};

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForFileReady(opts: { apiKey: string; name?: string; state?: string }) {
  if (!opts.name) return;
  if (!opts.state || opts.state === "ACTIVE") return;
  if (opts.state === "FAILED") throw new Error("Gemini File API: file processing failed");

  // Poll briefly for PROCESSING -> ACTIVE.
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${opts.name}`, {
      headers: { "x-goog-api-key": opts.apiKey },
    });
    if (!res.ok) break;
    const data = (await res.json()) as GeminiFile;
    const state = data?.file?.state;
    if (state === "ACTIVE" || !state) return;
    if (state === "FAILED") throw new Error("Gemini File API: file processing failed");
  }
}

export async function uploadToGeminiFiles(opts: {
  bytes: Uint8Array;
  mimeType: string;
  displayName: string;
}) {
  const { GEMINI_API_KEY } = getGeminiEnv();

  // Resumable upload (start -> upload, finalize).
  const startRes = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST",
    headers: {
      "x-goog-api-key": GEMINI_API_KEY,
      "x-goog-upload-protocol": "resumable",
      "x-goog-upload-command": "start",
      "x-goog-upload-header-content-length": String(opts.bytes.byteLength),
      "x-goog-upload-header-content-type": opts.mimeType,
      "content-type": "application/json",
    },
    body: JSON.stringify({ file: { displayName: opts.displayName } }),
  });

  if (!startRes.ok) {
    const txt = await startRes.text();
    throw new Error(`Gemini file upload start failed (${startRes.status}): ${txt}`);
  }

  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini file upload: missing x-goog-upload-url");

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "x-goog-upload-command": "upload, finalize",
      "x-goog-upload-offset": "0",
      "content-type": opts.mimeType,
      "content-length": String(opts.bytes.byteLength),
    },
    body: Buffer.from(opts.bytes),
  });

  if (!uploadRes.ok) {
    const txt = await uploadRes.text();
    throw new Error(`Gemini file upload finalize failed (${uploadRes.status}): ${txt}`);
  }

  const data = (await uploadRes.json()) as GeminiFile;
  if (!data?.file?.uri) throw new Error("Gemini file upload: missing file.uri");
  await waitForFileReady({ apiKey: GEMINI_API_KEY, name: data.file.name, state: data.file.state });
  return data.file;
}
