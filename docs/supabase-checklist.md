# Supabase Implementation Checklist — from local IndexedDB to shared DB

> Goal: keep Upload (/) + Members (/members) exactly as they work today, but persist events/members in Supabase so any organizer sees the same data across devices. Keep Luma and Engage separate, no merge.

## 0. Keep what you have (no break)
- Current store `src/lib/persistence/events.ts` (IndexedDB, `tech-community-ops` DB, `events` store) stays as local cache/fallback. Members tab reads `SessionEventRecord[]` via `groupByMember` — that shape doesn't change.

## 1. Supabase project setup (15 min)
- [ ] Create Supabase project (or reuse org's), note `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Add `.env.local` (gitignored) with those keys, add `src/lib/supabase/client.ts` (createClient)
- [ ] Install `npm i @supabase/supabase-js`
- [ ] Enable Row Level Security (RLS) on from day 1 (even if open initially)

## 2. Schema — minimal, matches current types (30 min)
- [ ] `events` table — mirrors `SessionEventRecord` + `EventDetails`
  ```sql
  create table events (
    id uuid primary key, -- from crypto.randomUUID() you already use
    name text not null,
    event_url text,
    instagram_url text,
    start_date text,
    end_date text,
    file_name text not null,
    file_size int not null,
    source text not null check (source in ('luma','engage')),
    detected_headers text[] not null default '{}',
    valid_row_count int not null default 0,
    invalid_row_count int not null default 0,
    created_at timestamptz default now(),
    created_by uuid references auth.users(id) -- nullable until auth
  );
  ```
- [ ] `event_rows` table — one row per CSV row, keeps `originalRow` + attendance signal
  ```sql
  create table event_rows (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references events(id) on delete cascade,
    row_number int not null,
    email text, -- normalized via normalizeEmail(), nullable for bad rows
    display_email text,
    display_name text,
    source text not null, -- 'luma' | 'engage'
    -- Luma fields
    check_in_time text,
    checked_in text,
    approval_status text,
    registration_status text,
    ticket_type text,
    -- Engage fields
    campus_email text,
    preferred_email text,
    attendance_status text,
    -- derived
    attended boolean not null, -- from classifyLumaAttendance / classifyEngageAttendance
    rsvp_label text, -- "approved • registered" for Luma, attendanceStatus for Engage
    original_row jsonb not null, -- CsvSourceRow verbatim for debugging
    issues jsonb not null default '[]'::jsonb, -- ImportIssue[]
    created_at timestamptz default now()
  );
  create index on event_rows (event_id);
  create index on event_rows (email); -- for groupByMember / leaderboard
  create index on event_rows (event_id, row_number);
  ```
- [ ] No `members` table yet — leaderboard stays derived via `groupByMember` over `event_rows` (same as local). Add materialized `members` view later if needed.

## 3. API layer — keep same `load/save/delete` shape (1 day)
- [ ] New `src/lib/persistence/supabaseEvents.ts` with *same* signatures as `events.ts` but Supabase:
  - `loadEventRecords(): Promise<SessionEventRecord[]>` — `select * from events` + `select * from event_rows` → reassemble to `SessionEventRecord` (reverse of today's `saveEventRecord` flattening)
  - `saveEventRecord(record: SessionEventRecord)` — insert into `events` + batch insert into `event_rows` (use `normalizeEmail` + `classify*` at write time so reads are fast)
  - `deleteEventRecord(eventId)` — `delete from events where id = ?` (cascade does rows)
  - `clearEventRecords()` — for admin only, or hide behind RLS
- [ ] Feature-flag: env `NEXT_PUBLIC_USE_SUPABASE=true` → use `supabaseEvents`, else fall back to IndexedDB. Lets you test without breaking local use.
- [ ] Update `src/app/members/page.tsx` and `src/components/attendance-csv-importer.tsx` to import from a single `src/lib/persistence/index.ts` that picks the flag — no other UI change.

## 4. RLS & Auth (only when you need sharing, 1–1.5 days)
- [ ] Start open: `create policy "allow all for anon" on events for all using (true)` + same for `event_rows` — keeps local-like behavior cross-device, fine for internal ops
- [ ] When ready for logins: enable Supabase Auth (email link or Google), then change policies to `auth.role() = 'authenticated'` and add `created_by = auth.uid()` check for writes, reads stay open or scoped to org
- [ ] Keep `original_row` visible to authenticated only if privacy needed

## 5. Migration from IndexedDB (half day)
- [ ] One-time “Sync local → Supabase” button in Upload tab (hidden behind flag) that reads `loadEventRecords()` from IndexedDB and calls `supabaseEvents.saveEventRecord` for each — lets you keep history when you first flip the flag
- [ ] No data loss — keep IndexedDB as offline cache for a few weeks after cutover

## 6. Members/Leaderboard with Supabase (no extra work)
- [ ] No new query needed initially — `groupByMember` already works on the reassembled `SessionEventRecord[]` from Supabase. Leaderboard + popup (Attended / RSVPed with “Not checked in but approved • registered”) stays identical
- [ ] Later optimization: SQL view `select email, count(*) filter (where attended) as attended_count, count(distinct event_id) as event_count from event_rows group by email order by attended_count desc` — replace client-side grouping when you have 100s of events

## 7. What *not* to build yet
- No separate `members` CRM table, no edits to past rows, no email sending — keeps scope to “upload → leaderboard that persists”

## 8. Verify after Supabase
- [ ] `npm run build` still 0, upload one Luma CSV with `Checked In=Yes` and one with `Check-in Time`, check Supabase Table Editor shows `event_rows.attended` true and `rsvp_label` correct
- [ ] Upload one Engage CSV, check `/members` leaderboard shows `ALEX@NYU.EDU` merged, popup shows `Attended — Attended` vs `RSVPed — approved`
- [ ] Two browsers see same Members tab after refresh
- [ ] Destructive test: delete an event in Upload → disappears in Members on other device

## Est. total
Supabase setup + schema + supabaseEvents + flag + sync button = **~1.5 days**. Auth adds **~1 day** when you want it. Members tab needs zero rework — it already just groups.

File to read for context before starting: `src/lib/persistence/events.ts:1`, `src/lib/matching/history.ts:1`, `src/types/event.ts:1`.
