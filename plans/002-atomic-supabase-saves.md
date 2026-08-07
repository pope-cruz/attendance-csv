# Plan 002: Make Supabase event saves atomic and retry-safe

> **Executor instructions**: Follow this plan exactly, run every verification
> gate, and stop on any STOP condition. Do not deploy SQL to a live Supabase
> project without the operator's explicit approval. Update `plans/README.md`
> when complete.
>
> **Drift check (run first)**:
> `git diff --stat 4411f449..HEAD -- src/lib/persistence/supabaseEvents.ts src/components/attendance-csv-importer.tsx supabase/schema.sql`
> Plan 001 may have changed other files; that is expected. Semantic changes in
> these three paths are a STOP condition until reconciled.

## Status

- **Priority**: P1
- **Effort**: M (about one day including SQL verification)
- **Risk**: MED — changes the only persistence write path
- **Depends on**: `plans/001-attendance-correctness.md`
- **Category**: bug
- **Planned at**: commit `4411f449`, 2026-08-07

## Why this matters

`saveEventRecord` currently performs an event upsert, row deletion, and row
insert as separate network requests. A failure can leave an event with missing
rows. The UI also generates a fresh UUID for every retry, so an ambiguous
network failure can create duplicate events. The fix is one Postgres
transaction exposed as a narrow Supabase RPC plus a stable client-generated ID
for all retries of the same pending import.

## Current state

- `src/lib/persistence/supabaseEvents.ts:216-244` performs three independent
  mutations:

  ```ts
  await supabase.from("events").upsert(...);
  await supabase.from("event_rows").delete().eq("event_id", record.id);
  await supabase.from("event_rows").insert(rows);
  ```

- `src/components/attendance-csv-importer.tsx:292-305` calls
  `crypto.randomUUID()` inside every save attempt.
- `supabase/schema.sql` contains tables and open RLS policies but no transaction
  function and no unique constraint on `(event_id, row_number)`.
- Persistence has no test file. Use Vitest mocking patterns already present in
  the repository; add no test library.
- Keep Supabase as the only persistence layer. Do not restore IndexedDB.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Persistence tests | `npx vitest run src/lib/persistence/supabaseEvents.test.ts` | exit 0 |
| All tests | `npm test` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | no new persistence/importer errors |
| Build | `npm run build -- --webpack` | exit 0 and `/`, `/members` generated |

## Scope

**In scope:**

- `src/lib/persistence/supabaseEvents.ts`
- `src/lib/persistence/supabaseEvents.test.ts` (create)
- `src/components/attendance-csv-importer.tsx`
- `supabase/schema.sql`
- `plans/README.md` for status only

**Out of scope:**

- Authentication and RLS policy replacement; plan 003 owns that
- CSV parsing, member matching, or UI redesign
- New persistence libraries or an ORM
- Deploying SQL without operator approval
- Silently deleting existing duplicate database rows

## Git workflow

- Branch: `codex/repair-002-atomic-supabase-saves`
- Suggested commit: `Make event saves atomic and retry-safe`
- Do not push, deploy SQL, or open a PR unless asked.

## Steps

### Step 1: Preflight existing row uniqueness

Before adding a unique constraint, give the operator this read-only query for
the live Supabase SQL editor:

```sql
select event_id, row_number, count(*)
from public.event_rows
group by event_id, row_number
having count(*) > 1;
```

Expected result is zero rows. If any row is returned, stop and report event IDs
and row numbers only; do not display attendee PII and do not delete anything.

### Step 2: Add a rerunnable transactional RPC

In `supabase/schema.sql`:

1. Add a unique index on `(event_id, row_number)` after the preflight passes.
2. Add a `create or replace function public.save_event_with_rows(...)` that
   accepts one event payload and one JSON array of row payloads.
3. Inside one PL/pgSQL function invocation, upsert the event, delete its prior
   rows, and insert all new rows with `jsonb_to_recordset`.
4. Use `security invoker` and `set search_path = public`; do not use
   `security definer`. Plan 003 will later restrict the caller through RLS.
5. Validate that the event ID in every row equals the event payload ID and
   raise an exception otherwise. Validate that rows payload is a JSON array.
6. Keep all existing table constraints and original-row JSON intact.

The function must be rerunnable with `create or replace`. Do not dynamically
concatenate SQL.

**Verify**: Run the schema in a disposable or operator-approved Supabase
project, then query `pg_proc` for `save_event_with_rows`; expect exactly one
function in schema `public`. Do not use production attendee data for testing.

### Step 3: Build one typed RPC payload

In `src/lib/persistence/supabaseEvents.ts`, extract a pure function such as
`buildSavePayload(record)` that returns:

- the event payload using current snake_case database names
- all flattened event rows produced by the existing source-specific branches

Keep `toSupabaseRows` private unless exporting it solely for tests would be
cleaner than testing through `saveEventRecord`. Do not include unknown-source
events; `createEventRecord` already blocks them, and the persistence boundary
should throw a clear error if called with one.

Replace the three client mutations with one awaited call:

```ts
const { error } = await supabase.rpc("save_event_with_rows", payload);
```

Throw a useful operator-facing error when the RPC fails. Never log attendee
payloads or original rows.

**Verify**: Typecheck exits 0 after the RPC argument names match the SQL
function parameters exactly.

### Step 4: Add persistence characterization tests

Create `src/lib/persistence/supabaseEvents.test.ts` with fake Luma and Engage
records. Mock `getSupabaseClient` and the client's `rpc` method. Test:

- one RPC call contains the event plus every source row
- Luma and Engage fields map to their existing database columns
- original rows and issues are preserved
- an RPC error rejects `saveEventRecord` with a useful message
- an unknown source rejects before any RPC call
- no `.from("events")`, row delete, or separate row insert is invoked

Do not connect to the network and do not use real attendee data.

**Verify**:
`npx vitest run src/lib/persistence/supabaseEvents.test.ts` exits 0.

### Step 5: Keep one ID across retries

In `AttendanceCsvImporter`, keep a `useRef<string | null>` for the pending
event ID:

- Allocate it only when the current import is first submitted.
- Reuse it after a failed or ambiguous save response.
- Clear it after a confirmed success, when attendance is cleared, or when a
  different file is successfully loaded.
- Changing event details after a failed save must retain the same ID so the
  transactional upsert repairs the same record.

Add a short comment only if the retry purpose is not clear from the name.

Do not add React testing dependencies for this ref. Verify the behavior with a
manual fake-data smoke test after the build: force one failed request, retry,
and confirm one event ID exists.

### Step 6: Run source and database gates

Run all local commands in the table. With operator approval, run a disposable
Supabase smoke test:

1. Save a fake event with two rows; expect one event and two rows.
2. Save the same ID with one row; expect one event and one row.
3. Deliberately send one invalid row in the same RPC; expect the entire call to
   fail and the previous event plus rows to remain unchanged.

Never run destructive failure tests against production data.

## Test plan

- Pure payload mapping for Luma and Engage.
- Original-row and issue preservation.
- RPC error propagation without PII leakage.
- Unknown-source rejection.
- SQL atomic replacement success and rollback behavior in a disposable project.
- Stable retry ID manual smoke test.

## Done criteria

- [ ] `(event_id, row_number)` has a unique index after a zero-row preflight.
- [ ] One `security invoker` RPC owns event-and-row replacement.
- [ ] `saveEventRecord` makes exactly one mutation request.
- [ ] A retry of the same pending import reuses its event ID.
- [ ] Persistence tests, all tests, typecheck, and webpack build exit 0.
- [ ] Lint has no new errors in in-scope files.
- [ ] No authentication, parser, or matching files changed.
- [ ] Plan 002 is marked `DONE`.

## STOP conditions

- The uniqueness preflight returns duplicate `(event_id, row_number)` values.
- The Supabase project does not permit creating a function.
- Atomic replacement would require `security definer` to bypass current RLS.
- The executor cannot test rollback in a disposable environment.
- A save path outside `saveEventRecord` is discovered.
- Any step appears to require logging or exposing original attendee rows.

## Maintenance notes

Plan 003 must grant authenticated allowlisted users access through normal RLS;
do not convert this RPC to `security definer` during auth work. Reviewers should
compare SQL parameter names with the `.rpc()` payload because PostgREST resolves
functions by those names.
