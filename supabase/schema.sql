-- Run this in Supabase Dashboard → SQL Editor → New query → Run
-- Creates events + event_rows for tech-community-ops. Safe to re-run.

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

-- Refuse to add the uniqueness guarantee if existing data needs review.
-- This block never deletes or modifies attendee rows.
do $$
begin
  if exists (
    select 1
    from public.event_rows
    group by event_id, row_number
    having count(*) > 1
  ) then
    raise exception 'Duplicate event_rows exist for an event_id and row_number. Review them before applying this schema.';
  end if;
end;
$$;

create unique index if not exists idx_event_rows_event_row_unique
  on event_rows (event_id, row_number);

-- Replaces an event and all of its rows in one database transaction.
-- SECURITY INVOKER keeps normal RLS checks in force for the caller.
create or replace function public.save_event_with_rows(
  event_payload jsonb,
  rows_payload jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  event_id_value uuid;
begin
  if jsonb_typeof(event_payload) is distinct from 'object' then
    raise exception 'event_payload must be a JSON object';
  end if;

  if jsonb_typeof(rows_payload) is distinct from 'array' then
    raise exception 'rows_payload must be a JSON array';
  end if;

  event_id_value := nullif(event_payload ->> 'id', '')::uuid;
  if event_id_value is null then
    raise exception 'event_payload.id is required';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(rows_payload) as row_item(value)
    where nullif(row_item.value ->> 'event_id', '')::uuid
      is distinct from event_id_value
  ) then
    raise exception 'Every row event_id must match event_payload.id';
  end if;

  insert into public.events (
    id,
    name,
    event_url,
    instagram_url,
    start_date,
    end_date,
    file_name,
    file_size,
    source,
    detected_headers,
    valid_row_count,
    invalid_row_count
  )
  values (
    event_id_value,
    event_payload ->> 'name',
    nullif(event_payload ->> 'event_url', ''),
    nullif(event_payload ->> 'instagram_url', ''),
    nullif(event_payload ->> 'start_date', ''),
    nullif(event_payload ->> 'end_date', ''),
    event_payload ->> 'file_name',
    (event_payload ->> 'file_size')::int,
    event_payload ->> 'source',
    array(
      select jsonb_array_elements_text(
        coalesce(event_payload -> 'detected_headers', '[]'::jsonb)
      )
    ),
    (event_payload ->> 'valid_row_count')::int,
    (event_payload ->> 'invalid_row_count')::int
  )
  on conflict (id) do update set
    name = excluded.name,
    event_url = excluded.event_url,
    instagram_url = excluded.instagram_url,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    file_name = excluded.file_name,
    file_size = excluded.file_size,
    source = excluded.source,
    detected_headers = excluded.detected_headers,
    valid_row_count = excluded.valid_row_count,
    invalid_row_count = excluded.invalid_row_count;

  delete from public.event_rows
  where event_id = event_id_value;

  insert into public.event_rows (
    event_id,
    row_number,
    email,
    display_email,
    display_name,
    source,
    check_in_time,
    checked_in,
    approval_status,
    registration_status,
    ticket_type,
    campus_email,
    preferred_email,
    attendance_status,
    attended,
    rsvp_label,
    original_row,
    issues
  )
  select
    row_data.event_id,
    row_data.row_number,
    row_data.email,
    row_data.display_email,
    row_data.display_name,
    row_data.source,
    row_data.check_in_time,
    row_data.checked_in,
    row_data.approval_status,
    row_data.registration_status,
    row_data.ticket_type,
    row_data.campus_email,
    row_data.preferred_email,
    row_data.attendance_status,
    row_data.attended,
    row_data.rsvp_label,
    row_data.original_row,
    coalesce(row_data.issues, '[]'::jsonb)
  from jsonb_to_recordset(rows_payload) as row_data (
    event_id uuid,
    row_number int,
    email text,
    display_email text,
    display_name text,
    source text,
    check_in_time text,
    checked_in text,
    approval_status text,
    registration_status text,
    ticket_type text,
    campus_email text,
    preferred_email text,
    attendance_status text,
    attended boolean,
    rsvp_label text,
    original_row jsonb,
    issues jsonb
  );
end;
$$;

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
