export function extForMime(mime: string) {
  const m = mime.toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mpeg")) return "mp3";
  if (m.includes("mp4")) return "m4a";
  if (m.includes("wav")) return "wav";
  return "bin";
}

