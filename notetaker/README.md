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
   - Create a private Storage bucket: `meeting-audio` (or set `MEETING_AUDIO_BUCKET`)
2. Google Gemini
   - Create an API key (Google AI Studio)
3. Env
   - Create `notetaker/.env.local` from `notetaker/.env.example`

## Run

```bash
npm i
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Notes

- The UI says "username", but Supabase Auth is email/password. We map username to `username@notetaker.local`.
- Supabase renamed the client key from “anon” to “publishable”. This app uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (and falls back to `NEXT_PUBLIC_SUPABASE_ANON_KEY` for legacy/local setups).
- Gemini processing runs server-side so the API key stays off the device.
