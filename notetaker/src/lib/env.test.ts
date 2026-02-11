import { afterEach, describe, expect, it } from "vitest";
import { getAppEnv, getGeminiEnv, getPublicEnv, getSupabaseServerEnv } from "./env";

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.MEETING_AUDIO_BUCKET;
}

afterEach(() => {
  resetEnv();
});

describe("env helpers", () => {
  it("resolves public env with publishable key", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_x";

    const env = getPublicEnv();
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://example.supabase.co");
    expect(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe("sb_publishable_x");
  });

  it("falls back to legacy anon key for public env", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "legacy_anon";

    const env = getPublicEnv();
    expect(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe("legacy_anon");
  });

  it("falls back to legacy service role key for server env", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_x";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role_legacy";

    const env = getSupabaseServerEnv();
    expect(env.SUPABASE_SECRET_KEY).toBe("service_role_legacy");
  });

  it("reads gemini env", () => {
    process.env.GEMINI_API_KEY = "gkey";
    expect(getGeminiEnv().GEMINI_API_KEY).toBe("gkey");
  });

  it("uses default audio bucket when unset", () => {
    expect(getAppEnv().MEETING_AUDIO_BUCKET).toBe("meeting-audio");
  });
});

