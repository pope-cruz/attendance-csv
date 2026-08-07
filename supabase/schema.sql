-- Run this in Supabase Dashboard → SQL Editor → New query → Run
-- Creates events + event_rows for tech-community-ops. Idempotent (safe to re-run fails if exists — drop first if needed).

create extension if not exists "pgcrypto";

create table if not exists events (
  id uuid primary key,
  name text not null,
  event_url text,
  instagram_url text,
  start_date text,
  end_date text,
  file_name text not null,
  file_size int not null check (file_size >= 0),
  source text not null check (source in ('luma','engage')),
  detected_headers text[] not null default '{}',
  valid_row_count int not null default 0,
  invalid_row_count int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists event_rows (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  row_number int not null check (row_number > 0),
  email text,
  display_email text,
  display_name text,
  source text not null check (source in ('luma','engage')),
  check_in_time text,
  checked_in text,
  approval_status text,
  registration_status text,
  ticket_type text,
  campus_email text,
  preferred_email text,
  attendance_status text,
  attended boolean not null,
  rsvp_label text,
  original_row jsonb not null,
  issues jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_event_rows_event_id on event_rows (event_id);
create index if not exists idx_event_rows_email on event_rows (email);
create index if not exists idx_event_rows_event_row on event_rows (event_id, row_number);
create index if not exists idx_events_created_at on events (created_at);

-- RLS: start open for internal ops (like current IndexedDB). Lock down later with auth.
alter table events enable row level security;
alter table event_rows enable row level security;

-- Drop if re-running, then create
drop policy if exists "allow_all_events" on events;
create policy "allow_all_events" on events for all using (true) with check (true);

drop policy if exists "allow_all_event_rows" on event_rows;
create policy "allow_all_event_rows" on event_rows for all using (true) with check (true);

-- Verify
select 'events' as table_name, count(*) from events
union all
select 'event_rows', count(*) from event_rows;
