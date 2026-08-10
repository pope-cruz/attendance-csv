-- EMERGENCY ROLLBACK ONLY: this makes attendance data anonymously accessible
-- to anyone with the public project URL and anon key.
-- Run in the Supabase SQL Editor only to restore the old access model.

begin;

alter table public.events enable row level security;
alter table public.event_rows enable row level security;

drop policy if exists "allowlist_select_events" on public.events;
drop policy if exists "allowlist_insert_events" on public.events;
drop policy if exists "allowlist_update_events" on public.events;
drop policy if exists "allowlist_delete_events" on public.events;
drop policy if exists "allowlist_select_event_rows" on public.event_rows;
drop policy if exists "allowlist_insert_event_rows" on public.event_rows;
drop policy if exists "allowlist_update_event_rows" on public.event_rows;
drop policy if exists "allowlist_delete_event_rows" on public.event_rows;

drop function if exists public.is_allowed_operator();
drop table if exists public.allowed_emails;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete
  on table public.events, public.event_rows
  to anon, authenticated;
grant execute on function public.save_event_with_rows(jsonb, jsonb)
  to anon, authenticated;

drop policy if exists "allow_all_events" on public.events;
create policy "allow_all_events"
  on public.events for all
  using (true)
  with check (true);

drop policy if exists "allow_all_event_rows" on public.event_rows;
create policy "allow_all_event_rows"
  on public.event_rows for all
  using (true)
  with check (true);

commit;

-- Both rows should report true for anon after the transaction commits.
select
  has_table_privilege('anon', 'public.events', 'select') as anon_can_read_events,
  has_table_privilege('anon', 'public.event_rows', 'select') as anon_can_read_event_rows;
