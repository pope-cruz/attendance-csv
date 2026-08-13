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
  file_issues jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- Existing projects need an explicit migration because CREATE TABLE IF NOT EXISTS
-- does not add newly declared columns.
alter table public.events
  add column if not exists file_issues jsonb not null default '[]'::jsonb;

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
  resolution_status text check (resolution_status in ('corrected','excluded')),
  corrected_email text,
  corrected_name text,
  resolution_note text,
  resolver_label text,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.event_rows
  add column if not exists resolution_status text,
  add column if not exists corrected_email text,
  add column if not exists corrected_name text,
  add column if not exists resolution_note text,
  add column if not exists resolver_label text,
  add column if not exists resolved_by uuid references auth.users(id),
  add column if not exists resolved_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_rows_resolution_status_check'
      and conrelid = 'public.event_rows'::regclass
  ) then
    alter table public.event_rows
      add constraint event_rows_resolution_status_check
      check (resolution_status in ('corrected','excluded'));
  end if;
end;
$$;

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

-- Resolves an imported row without changing its source values, issues, or
-- attendance fields. Re-resolving replaces the current resolution metadata.
create or replace function public.resolve_event_row(
  event_id_value uuid,
  row_number_value int,
  resolution_status_value text,
  corrected_email_value text,
  corrected_name_value text,
  resolution_note_value text,
  resolver_label_value text
)
returns public.event_rows
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_row public.event_rows;
  normalized_email text;
  saved_row public.event_rows;
begin
  select * into target_row
  from public.event_rows
  where event_id = event_id_value and row_number = row_number_value;

  if not found then
    raise exception 'Attendance row was not found';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(coalesce(target_row.issues, '[]'::jsonb)) issue
    where issue ->> 'severity' = 'error'
  ) then
    raise exception 'Only rows with error issues can be resolved';
  end if;

  if resolution_status_value not in ('corrected', 'excluded') then
    raise exception 'Resolution must be corrected or excluded';
  end if;

  if nullif(btrim(resolution_note_value), '') is null then
    raise exception 'A resolution note is required';
  end if;

  if nullif(btrim(resolver_label_value), '') is null then
    raise exception 'A resolver name or initials is required';
  end if;

  normalized_email := lower(btrim(corrected_email_value));

  if resolution_status_value = 'corrected' then
    if normalized_email is null or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'A valid corrected email is required';
    end if;

    if target_row.source = 'engage' and normalized_email !~ '@nyu\.edu$' then
      raise exception 'NYU Engage corrections must use an @nyu.edu email';
    end if;

    if exists (
      select 1
      from public.event_rows other_row
      where other_row.event_id = event_id_value
        and other_row.row_number <> row_number_value
        and other_row.resolution_status is distinct from 'excluded'
        and lower(btrim(
          case
            when other_row.resolution_status = 'corrected' then other_row.corrected_email
            when not exists (
              select 1
              from jsonb_array_elements(coalesce(other_row.issues, '[]'::jsonb)) other_issue
              where other_issue ->> 'severity' = 'error'
            ) then other_row.email
          end
        )) = normalized_email
    ) then
      raise exception 'That email is already used by another usable row in this event';
    end if;
  end if;

  update public.event_rows
  set
    resolution_status = resolution_status_value,
    corrected_email = case when resolution_status_value = 'corrected' then normalized_email end,
    corrected_name = case
      when resolution_status_value = 'corrected' then nullif(btrim(corrected_name_value), '')
    end,
    resolution_note = btrim(resolution_note_value),
    resolver_label = btrim(resolver_label_value),
    resolved_by = auth.uid(),
    resolved_at = now()
  where event_id = event_id_value and row_number = row_number_value
  returning * into saved_row;

  return saved_row;
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
    invalid_row_count,
    file_issues
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
    (event_payload ->> 'invalid_row_count')::int,
    coalesce(event_payload -> 'file_issues', '[]'::jsonb)
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
    invalid_row_count = excluded.invalid_row_count,
    file_issues = excluded.file_issues;

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

-- The browser uses one shared Supabase Auth operator account. The public anon
-- key identifies the project; only an authenticated session may access data.
alter table public.events enable row level security;
alter table public.event_rows enable row level security;

-- Remove policies from earlier access-control experiments when this file is re-run.
drop policy if exists "allowlist_select_events" on public.events;
drop policy if exists "allowlist_insert_events" on public.events;
drop policy if exists "allowlist_update_events" on public.events;
drop policy if exists "allowlist_delete_events" on public.events;
drop policy if exists "allowlist_select_event_rows" on public.event_rows;
drop policy if exists "allowlist_insert_event_rows" on public.event_rows;
drop policy if exists "allowlist_update_event_rows" on public.event_rows;
drop policy if exists "allowlist_delete_event_rows" on public.event_rows;

drop policy if exists "allow_all_events" on public.events;
drop policy if exists "allow_all_event_rows" on public.event_rows;
drop policy if exists "authenticated_all_events" on public.events;
drop policy if exists "authenticated_all_event_rows" on public.event_rows;

revoke all privileges
  on table public.events, public.event_rows
  from anon, public;
revoke execute on function public.save_event_with_rows(jsonb, jsonb)
  from anon, public;
revoke execute on function public.resolve_event_row(uuid, int, text, text, text, text, text)
  from anon, public;

grant usage on schema public to authenticated;
grant select, insert, update, delete
  on table public.events, public.event_rows
  to authenticated;
grant execute on function public.save_event_with_rows(jsonb, jsonb)
  to authenticated;
grant execute on function public.resolve_event_row(uuid, int, text, text, text, text, text)
  to authenticated;

create policy "authenticated_all_events"
  on public.events for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated_all_event_rows"
  on public.event_rows for all
  to authenticated
  using (true)
  with check (true);

-- Verify
select 'events' as table_name, count(*) from events
union all
select 'event_rows', count(*) from event_rows;
