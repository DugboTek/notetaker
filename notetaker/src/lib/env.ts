import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export function getPublicEnv() {
  const publishableOrAnon =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableOrAnon,
  });
  if (!parsed.success) {
    throw new Error(`Missing/invalid env: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  }
  return parsed.data;
}

const supabaseServerSchema = publicSchema.extend({
  SUPABASE_SECRET_KEY: z.string().min(1),
});

export function getSupabaseServerEnv() {
  const secret =
    process.env.SUPABASE_SECRET_KEY ??
    // Back-compat for older projects / local Supabase.
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  const parsed = supabaseServerSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SECRET_KEY: secret,
  });
  if (!parsed.success) {
    throw new Error(`Missing/invalid env: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  }
  return parsed.data;
}

const geminiSchema = z.object({
  GEMINI_API_KEY: z.string().min(1),
});

export function getGeminiEnv() {
  const parsed = geminiSchema.safeParse({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  });
  if (!parsed.success) {
    throw new Error(`Missing/invalid env: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  }
  return parsed.data;
}

export function getAppEnv() {
  const bucket = (process.env.MEETING_AUDIO_BUCKET || "").trim();
  return {
    MEETING_AUDIO_BUCKET: bucket || "meeting-audio",
  };
}
