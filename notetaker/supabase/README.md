# Supabase Setup

This app expects:

- A Supabase project
- Auth enabled (email/password)
- A private storage bucket named `meeting-audio`
  - Or set `MEETING_AUDIO_BUCKET` to your bucket name
- Tables/policies from `supabase/migrations/0001_init.sql`

## Quick Start

1. Create a Supabase project.
2. In Supabase SQL editor, run:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_meeting_chunks.sql`
3. Create a storage bucket named `meeting-audio` (private).
   - Optional: the app will auto-create it on first upload if it doesn't exist.
4. Copy keys into `notetaker/.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
5. Create a Google AI Studio API key and set `GEMINI_API_KEY`.

Notes:
- For local Supabase (CLI), you may only see legacy `anon` / `service_role` keys. The app accepts those via fallback env vars too.
- Audio is uploaded directly from the browser to Supabase Storage using a signed upload token (so deployments on Vercel won't hit function payload limits).
- Long meetings are stored as chunks and processed in parallel passes server-side.
- In Vercel, a cron route (`/api/cron/process`) continues processing meetings in the background when the app tab is closed.
