-- Run this once in Supabase Dashboard → SQL Editor after deploying the login UI.
-- It removes anonymous database access and allows only signed-in Supabase users.
-- Safe to re-run.

begin;

alter table public.events enable row level security;
alter table public.event_rows enable row level security;

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

commit;

-- Expected result: authenticated = allowed, anon = denied.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('events', 'event_rows')
  and grantee in ('anon', 'authenticated')
order by grantee, table_name, privilege_type;
