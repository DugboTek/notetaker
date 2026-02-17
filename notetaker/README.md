# Notetaker (Gemini 3 Flash + Supabase)

Record a meeting on your phone mic, then:

- Transcript
- Summary
- Action items
- Chat about the meeting

## Setup

1. Supabase
   - Create a project
   - Run `supabase/migrations/0001_init.sql`
   - Run `supabase/migrations/0002_meeting_chunks.sql`
   - Create a private Storage bucket: `meeting-audio` (or set `MEETING_AUDIO_BUCKET`)
2. Google Gemini
   - Create an API key (Google AI Studio)
3. Env
   - Create `notetaker/.env.local` from `notetaker/.env.example`
4. Vercel cron (for background processing)
   - Set `CRON_SECRET` in Vercel env vars
   - Optional: set `CRON_MEETING_BATCH_SIZE` (default `1`)
   - Keep `vercel.json` in this folder so `/api/cron/process` runs every minute

## Run

```bash
npm i
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Notes

- The UI says "username", but Supabase Auth is email/password. We map usernames to `username@notetaker.user` (or use your real email if you type one).
- Supabase renamed the client key from “anon” to “publishable”. This app uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (and falls back to `NEXT_PUBLIC_SUPABASE_ANON_KEY` for legacy/local setups).
- Gemini processing runs server-side so the API key stays off the device.
- On Vercel, meeting audio uploads go directly to Supabase Storage via signed upload URLs (so you don't hit function payload limits).
- For long meetings, recording uploads in chunks and processing uses server-side parallel chunk workers with retries.
- You can tune chunk-processing speed using `PROCESSING_*` env vars in `.env.example`.
- Background processing is enabled via Vercel Cron so transcription keeps moving even if the browser tab closes.
