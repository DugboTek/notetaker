-- Chunked recording support for long meetings.
-- Each uploaded chunk can be transcribed independently, then merged.

create table if not exists public.meeting_chunks (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),

  seq int not null,
  audio_bucket text not null default 'meeting-audio',
  audio_path text not null,
  audio_mime text,
  audio_size_bytes bigint,

  status text not null default 'uploading', -- uploading | uploaded | processed | error
  transcript_text text,
  error text,

  unique (meeting_id, seq)
);

create index if not exists meeting_chunks_meeting_id_seq_idx
  on public.meeting_chunks (meeting_id, seq asc);

create index if not exists meeting_chunks_user_id_created_at_idx
  on public.meeting_chunks (user_id, created_at desc);

alter table public.meeting_chunks enable row level security;

drop policy if exists "meeting_chunks_select_own" on public.meeting_chunks;
create policy "meeting_chunks_select_own"
  on public.meeting_chunks for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "meeting_chunks_insert_own" on public.meeting_chunks;
create policy "meeting_chunks_insert_own"
  on public.meeting_chunks for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "meeting_chunks_update_own" on public.meeting_chunks;
create policy "meeting_chunks_update_own"
  on public.meeting_chunks for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "meeting_chunks_delete_own" on public.meeting_chunks;
create policy "meeting_chunks_delete_own"
  on public.meeting_chunks for delete
  to authenticated
  using (auth.uid() = user_id);

