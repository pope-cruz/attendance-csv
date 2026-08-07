# Plan 005: Preserve validation issues through the Supabase round trip

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the STOP conditions occurs, stop and report it;
> do not improvise. Do not deploy SQL to a live Supabase project without the
> operator's explicit approval. When done, update this plan's status row in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 4411f449 -- src/lib/persistence/supabaseEvents.ts src/lib/persistence/supabaseEvents.test.ts supabase/schema.sql`
> This plan was written while Plan 002 was in progress in the working tree.
> Its atomic RPC and persistence test are expected. Compare the current-state
> excerpts below with the live code; any semantic mismatch after Plan 002 is
> complete is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M (about one day including migration and live verification)
- **Risk**: MED — changes the persisted event shape and the only save RPC
- **Depends on**: `plans/002-atomic-supabase-saves.md`
- **Category**: bug
- **Planned at**: commit `4411f449`, 2026-08-07

## Why this matters

Recognized Luma and Engage imports can carry file-level parsing issues in
`result.data.fileIssues`. The current Supabase payload does not save those
issues, and the load path always reconstructs `fileIssues` as an empty array.
After a refresh, an operator can therefore lose validation evidence and see an
incorrect "All rows passed validation" message.

This plan makes the event persistence mapping lossless for file-level issues
and adds a client-side save/load round-trip test using fake data. Row-level
issues and original source rows already have database columns and must continue
to round-trip unchanged.

## Current state

- `src/lib/persistence/supabaseEvents.ts:31-49` defines the event payload but
  has no field for file-level issues:

  ```ts
  type EventPayload = {
    id: string;
    name: string;
    // existing event fields...
    detected_headers: string[];
    valid_row_count: number;
    invalid_row_count: number;
  };
  ```

- `src/lib/persistence/supabaseEvents.ts:112-134` builds the RPC payload from
  the import result but omits `result.data.fileIssues`:

  ```ts
  event_payload: {
    // existing fields...
    detected_headers: result.data.detectedHeaders,
    valid_row_count: result.data.validRowCount,
    invalid_row_count: result.data.invalidRowCount,
  },
  ```

- `src/lib/persistence/supabaseEvents.ts:201` and `:244` hard-code the value
  away for both source branches:

  ```ts
  fileIssues: [],
  ```

- `supabase/schema.sql:6-21` stores headers and row counts on `events`, but has
  no `file_issues` column. The Plan 002 RPC at `supabase/schema.sql:105-148`
  likewise omits file issues from its insert and conflict update.
- `src/lib/persistence/supabaseEvents.test.ts` currently imports and tests only
  `saveEventRecord`. It verifies RPC serialization of event rows, original
  rows, and row-level issues, but does not call `loadEventRecords` or exercise
  a complete mapping in both directions.
- `src/components/attendance-csv-importer.tsx:1059-1062` already combines
  `data.fileIssues` with row issues. No UI change is needed once persistence
  restores the data correctly.
- The repository requires fake test data, strict TypeScript, and no silent
  discard of malformed input. Match the existing fake Luma and Engage record
  builders in `src/lib/persistence/supabaseEvents.test.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused persistence tests | `npx vitest run src/lib/persistence/supabaseEvents.test.ts` | exit 0; all persistence tests pass |
| Focused lint | `npx eslint src/lib/persistence/supabaseEvents.ts src/lib/persistence/supabaseEvents.test.ts` | exit 0, zero warnings |
| All tests | `npm test` | exit 0; all tests pass |
| Typecheck | `npm run typecheck` | exit 0, no errors |
| Build | `npm run build -- --webpack` | exit 0; `/` and `/members` are generated |

## Scope

**In scope — modify only these files:**

- `src/lib/persistence/supabaseEvents.ts`
- `src/lib/persistence/supabaseEvents.test.ts`
- `supabase/schema.sql`
- `plans/README.md` for status only

**Out of scope:**

- Luma or Engage parsing and their tests
- Attendance classification or member matching
- React components or UI copy
- Authentication, RLS policy changes, roles, or a `members` table
- Persisting the complete raw CSV text; continue preserving the existing
  original row JSON only
- Moving file-level issues onto every `event_rows` record
- Adding a schema-validation library, ORM, or test dependency
- Deploying SQL without explicit operator approval
- Reading, printing, or modifying real attendee data

## Git workflow

- Branch: `codex/repair-005-lossless-supabase-roundtrip`
- Suggested commit: `Preserve validation issues through Supabase`
- Do not push, deploy, or open a pull request unless explicitly asked.

## Steps

### Step 1: Add a migration-safe event column

In `supabase/schema.sql`, add this event-level column:

```sql
file_issues jsonb not null default '[]'::jsonb
```

Include it in the `create table if not exists events` definition for new
projects. Because `create table if not exists` does not add columns to an
existing table, also add a rerunnable migration statement after the table
definition:

```sql
alter table public.events
  add column if not exists file_issues jsonb not null default '[]'::jsonb;
```

Do not store file-level issues on `event_rows`; they describe the file, not an
individual attendee. Do not remove or rename any existing column.

**Verify**: In a disposable or operator-approved Supabase project, run the
schema twice. Both runs must succeed. Then run:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'events'
  and column_name = 'file_issues';
```

Expected: exactly one `jsonb` row, `is_nullable = 'NO'`, with an empty JSON
array default.

### Step 2: Extend the atomic RPC without weakening it

Update `public.save_event_with_rows` in `supabase/schema.sql` so the event
insert includes `file_issues`, using an empty array when an older caller omits
the key:

```sql
coalesce(event_payload -> 'file_issues', '[]'::jsonb)
```

Also set `file_issues = excluded.file_issues` in the `on conflict (id) do
update` clause so retrying or replacing the same event updates its file-level
issues. Preserve all Plan 002 properties:

- one transaction for the event and its rows
- `security invoker`
- explicit `search_path = public`
- matching event IDs
- row replacement and rollback behavior
- no dynamic SQL and no logging of payloads

**Verify**: Run the focused SQL smoke test from Step 5 after the TypeScript
payload is updated. A second save of the same event ID with a different
`file_issues` array must replace the old array without duplicating the event.

### Step 3: Map file issues into and out of Supabase

In `src/lib/persistence/supabaseEvents.ts`:

1. Import `ImportIssue` as a type from `@/types/import` alongside the existing
   import result type.
2. Add `file_issues: ImportIssue[]` to `EventPayload`.
3. In `buildSavePayload`, set
   `file_issues: result.data.fileIssues` without changing, filtering, or
   rewording any issue.
4. In both the Luma and Engage branches of `loadEventRecords`, replace the
   hard-coded empty array with the stored event value. Use `[]` only as a
   backwards-compatible fallback when the database value is null or absent.

The mapping must preserve each issue's `code`, `severity`, `message`, and
optional `rowNumber`. Do not merge file issues with row issues at the
persistence layer; the existing UI owns presentation aggregation.

**Verify**: `npm run typecheck` exits 0. Search with
`rg -n "fileIssues: \[\]" src/lib/persistence/supabaseEvents.ts`; expected
result is no matches.

### Step 4: Add save/load round-trip characterization tests

Extend `src/lib/persistence/supabaseEvents.test.ts`; do not create a second
persistence test file. Keep all names and emails fake.

Update the Supabase mock so it can independently model:

- the `rpc` call used by `saveEventRecord`
- the ordered `events` query used by `loadEventRecords`
- the ordered `event_rows` query, including its `.in(...)` filter

Retain every existing Plan 002 test. Add tests covering:

1. A fake Luma record with one file-level `malformed_csv` issue serializes that
   exact issue under `event_payload.file_issues`.
2. A fake Engage record with a file-level issue serializes it identically.
3. `loadEventRecords` restores stored Luma file issues rather than `[]`.
4. `loadEventRecords` restores stored Engage file issues rather than `[]`.
5. A legacy event row with a missing or null `file_issues` value loads as an
   empty array.
6. A client-side round-trip: call `saveEventRecord`, capture its fake RPC
   payload, adapt that snake_case payload into the fake `events` and
   `event_rows` query results, call `loadEventRecords`, and assert that these
   fields match the original record:
   - event details and source
   - detected headers and valid/invalid counts
   - file-level issues
   - every row number
   - original row JSON
   - row-level issues
   - source-specific attendance fields used by classification and Members

The round-trip test is a client mapping test, not a live network test. Do not
mock away `buildSavePayload` or the load reconstruction being verified.

**Verify**:
`npx vitest run src/lib/persistence/supabaseEvents.test.ts` exits 0 and the new
tests fail if either save or load mapping drops `fileIssues`.

### Step 5: Verify the live database contract with fake data

Only with operator approval, run this in a disposable project or a project
where fake test events are explicitly allowed:

1. Call `save_event_with_rows` with a fake event ID, one fake attendee row, and
   one fake file issue.
2. Select only `id` and `file_issues` for that fake event. Expect the issue
   object to match exactly.
3. Call the RPC again with the same event ID and an empty file-issue array.
   Expect one event, the expected attendee rows, and `file_issues = []`.
4. Reload the app and confirm its validation panel still shows a saved fake
   file issue when one is stored.
5. Delete only the fake event by its explicit UUID after verification.

Never use production attendee names, emails, phone numbers, card IDs, comments,
or original rows in this smoke test. Never run a broad delete.

**Verify**: The selected fake event shows the exact file-issue JSON before the
second save and an empty array after it. No unrelated event count changes.

### Step 6: Run all local gates and stop

Run the focused test and lint commands first, then all tests, typecheck, and the
webpack build. Review `git status --short` and confirm only the four in-scope
paths changed. Update Plan 005 to `DONE` only after the schema and live fake-data
contract have been verified; otherwise leave it `IN PROGRESS` with the exact
remaining external step.

## Test plan

- Save serialization for Luma and Engage file issues.
- Load reconstruction for Luma and Engage file issues.
- Backwards-compatible empty array for pre-migration/null values.
- One client-side save/load mapping round trip covering file issues, row
  issues, original rows, counts, headers, and source-specific attendance data.
- One operator-approved SQL smoke test proving insert and conflict-update
  behavior for the new JSONB column.
- Existing atomic-save, retry, classification, and matching tests remain green.

## Done criteria

- [ ] `public.events.file_issues` exists as non-null JSONB with an empty-array
  default in both fresh and migrated schemas.
- [ ] The atomic RPC inserts and updates `file_issues` without weakening Plan
  002's transaction or RLS behavior.
- [ ] `buildSavePayload` preserves `result.data.fileIssues` exactly.
- [ ] Both load branches restore stored file issues and fall back to `[]` only
  for legacy null/missing values.
- [ ] The client-side save/load round-trip test exists and passes with fake
  Luma and Engage data.
- [ ] Focused lint, focused tests, all tests, typecheck, and webpack build exit
  0.
- [ ] No parser, matching, classification, UI, or auth files changed.
- [ ] Live or disposable-project verification used fake data only.
- [ ] Plan 005 is marked `DONE`, or remains `IN PROGRESS` with only an explicit
  external verification step outstanding.

## STOP conditions

Stop and report back; do not improvise if:

- Plan 002 is not complete enough to provide one atomic
  `save_event_with_rows` RPC.
- The live `events` table already has a `file_issues` column with a different
  type, nullability rule, or meaning.
- The schema migration would drop, rewrite, or expose existing attendee data.
- Preserving file issues appears to require parser, UI, matching, or auth
  changes.
- The round-trip test reveals loss of a different field. Report that separate
  finding instead of expanding this milestone.
- SQL deployment or live-data cleanup would require unapproved access or a
  broad delete.
- Any local verification command fails twice after a reasonable in-scope fix.

## Maintenance notes

- Any future event-level import metadata must be added to all four locations:
  the `events` schema, the atomic RPC, `buildSavePayload`, and
  `loadEventRecords`. The round-trip test should be updated in the same change.
- Reviewers should scrutinize the conflict-update clause; saving an existing
  event ID must replace stale file issues rather than leave them behind.
- Plan 003 should preserve the RPC as `security invoker` and authorize it
  through normal RLS. Do not turn this function into an auth bypass.
- Runtime validation of unexpected database JSON is deliberately deferred. It
  would add complexity beyond this small, typed persistence repair.
