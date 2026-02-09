-- Core tables for the Notetaker app.
-- Uses Supabase Auth for users and stores meeting outputs + chat.

create extension if not exists pgcrypto;

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),

  title text,
  status text not null default 'uploaded', -- uploaded | processing | ready | error
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds int,

  audio_bucket text not null default 'meeting-audio',
  audio_path text,
  audio_mime text,
  audio_size_bytes bigint,

  transcript_text text,
  transcript_json jsonb,
  summary_json jsonb,
  action_items_json jsonb,
  decisions_json jsonb,
  key_topics_json jsonb,

  model text,
  error text
);

create index if not exists meetings_user_id_created_at_idx
  on public.meetings (user_id, created_at desc);

create table if not exists public.meeting_messages (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  role text not null check (role in ('user', 'assistant')),
  content text not null
);

create index if not exists meeting_messages_meeting_id_created_at_idx
  on public.meeting_messages (meeting_id, created_at asc);

alter table public.meetings enable row level security;
alter table public.meeting_messages enable row level security;

-- Meetings: only the owner can read/write.
drop policy if exists "meetings_select_own" on public.meetings;
create policy "meetings_select_own"
  on public.meetings for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "meetings_insert_own" on public.meetings;
create policy "meetings_insert_own"
  on public.meetings for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "meetings_update_own" on public.meetings;
create policy "meetings_update_own"
  on public.meetings for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "meetings_delete_own" on public.meetings;
create policy "meetings_delete_own"
  on public.meetings for delete
  to authenticated
  using (auth.uid() = user_id);

-- Messages: only the owner can read/write.
drop policy if exists "meeting_messages_select_own" on public.meeting_messages;
create policy "meeting_messages_select_own"
  on public.meeting_messages for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "meeting_messages_insert_own" on public.meeting_messages;
create policy "meeting_messages_insert_own"
  on public.meeting_messages for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "meeting_messages_delete_own" on public.meeting_messages;
create policy "meeting_messages_delete_own"
  on public.meeting_messages for delete
  to authenticated
  using (auth.uid() = user_id);

