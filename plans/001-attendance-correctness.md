# Plan 001: Make attendance and member counts ambiguity-safe

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report it; do not improvise. When done,
> update this plan's row in `plans/README.md` to `DONE`.
>
> **Drift check (run first)**:
> `git diff --stat 4411f449..HEAD -- src/lib/attendance/classify.ts src/types/attendance.ts src/lib/attendance/classify.test.ts src/lib/matching/history.ts src/lib/matching/history.test.ts`
> If an in-scope file changed, compare the excerpts below with live code. Any
> semantic mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S (hours)
- **Risk**: MED — this intentionally changes displayed attendance totals
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `4411f449`, 2026-08-07

## Why this matters

The product treats email as identity and explicitly forbids silently merging
ambiguous people. Parsing flags duplicate and invalid identities, but
`groupByMember` currently merges those rows and increments attendance once per
row. The Luma classifier also treats every unfamiliar non-empty `Checked In`
value as attended. Together these behaviors can produce confident-looking but
incorrect attendance totals.

After this plan, only resolved identities appear in member history,
`attendedCount` means distinct events attended rather than attended source
rows, and only documented affirmative Luma values count as attended.

## Current state

- `src/lib/attendance/classify.ts:16-41` recognizes explicit truthy/falsy
  values, then treats any remaining non-empty value as attended:

  ```ts
  if (truthy.has(rawCheckedIn)) { /* attended */ }
  if (falsy.has(rawCheckedIn)) { /* unknown */ }
  if (attendee?.checkedIn?.trim()) { /* attended */ }
  ```

- `src/lib/matching/history.ts:40-47` and `:93-101` require an email but do not
  reject rows carrying identity errors such as `duplicate_email` or
  `invalid_email`.
- `src/lib/matching/history.ts:84-87` and `:133-136` increment
  `attendedCount` per row. `eventCount` is separately deduplicated by event ID.
- `src/lib/matching/history.test.ts:61-88` currently codifies the bug by
  expecting two repeated Engage rows from one event to count twice.
- Keep Luma and Engage parsing separate. Do not modify `src/lib/csv/luma.ts`,
  `src/lib/csv/engage.ts`, or their parsing rules.
- Tests use Vitest with fake names and emails. Match the table-driven style in
  `src/lib/attendance/classify.test.ts` and the record helpers in
  `src/lib/matching/history.test.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `npx vitest run src/lib/attendance/classify.test.ts src/lib/matching/history.test.ts` | exit 0, all focused tests pass |
| All tests | `npm test` | exit 0, all tests pass |
| Typecheck | `npm run typecheck` | exit 0, no errors |
| Lint | `npm run lint` | Existing Members lint error may remain; no new errors in in-scope files |

## Scope

**In scope — modify only these files:**

- `src/lib/attendance/classify.ts`
- `src/types/attendance.ts`
- `src/lib/attendance/classify.test.ts`
- `src/lib/matching/history.ts`
- `src/lib/matching/history.test.ts`
- `plans/README.md` for status only

**Out of scope:**

- Source-specific CSV parsers
- Supabase persistence or schema
- React components and visual changes
- A `members` database table
- Automatically choosing one of two ambiguous rows

## Git workflow

- Branch: `codex/repair-001-attendance-correctness`
- Use one concise imperative commit, for example:
  `Make attendance counts ambiguity-safe`
- Do not push or open a PR unless the operator explicitly asks.

## Steps

### Step 1: Characterize explicit Luma values

Add cases to `src/lib/attendance/classify.test.ts` before changing production
logic:

- `Yes`, `Y`, `true`, `1`, `checked in`, `checked-in`, and `attended` are
  attended, case-insensitively and with surrounding whitespace.
- `No`, `N`, `false`, `0`, `not checked in`, and `not checked-in` are unknown.
- An unfamiliar value such as `Pending review` is unknown and preserves the
  raw value for operator debugging.
- A non-empty `checkInTime` remains attended regardless of `checkedIn`.

Add a clear basis value such as `unrecognized_luma_check_in` to
`AttendanceClassificationBasis` in `src/types/attendance.ts` and use it for
the unfamiliar-value case. Do not reuse the Engage-specific meaning if that
would make error messages less clear.

**Verify**:
`npx vitest run src/lib/attendance/classify.test.ts` initially exposes the
unfamiliar-value bug, then exits 0 after the implementation change.

### Step 2: Remove the catch-all attended branch

In `classifyLumaAttendance`, keep the explicit affirmative set and explicit
negative set. Replace the catch-all attended branch with an unknown result
whose basis is the new basis and whose `rawValue` is the original
`checkedIn` string. Preserve the existing check-in-time precedence.

Keep the sets local and readable; do not introduce a dependency.

**Verify**: `npx vitest run src/lib/attendance/classify.test.ts` exits 0.

### Step 3: Characterize unresolved identities in member history

Extend the fake row helpers in `src/lib/matching/history.test.ts` so a row can
carry `ImportIssue[]`. Add tests proving that rows with any of these identity
issue codes are excluded from member history for both sources:

- `missing_email_header`
- `missing_email`
- `missing_nyu_email`
- `conflicting_nyu_emails`
- `invalid_email`
- `duplicate_email`

A `malformed_csv` issue alone should also be excluded because the row cannot
be trusted for derived member history, while remaining preserved in the event
record and Upload review. A valid row with no issues must continue to appear.

Change the existing repeated-Engage-row test: do not expect three attendance
credits for two events. It should either model valid one-row-per-event data and
expect two credits, or explicitly mark repeated rows as duplicates and expect
that ambiguous event to contribute no member-history credit.

**Verify**: `npx vitest run src/lib/matching/history.test.ts` fails for the new
cases before production changes and later exits 0.

### Step 4: Filter rows and derive distinct-event counts

In `src/lib/matching/history.ts`, add a small local pure helper that decides
whether a row is safe for member history. It must require a non-empty email and
zero error-severity issues. Do not mutate or discard the source row itself;
only skip it in this derived view.

After collecting valid entries, derive both counts from distinct event IDs:

- `eventCount`: distinct IDs in `allEvents`
- `attendedCount`: distinct IDs in `attendedEvents`

Ensure `attendedEvents` contains at most one entry per event. If two valid rows
somehow survive for the same email and event despite parser safeguards, do not
guess between them: skip that event for derived attendance and add a focused
test. Prefer a clear two-pass grouping by email and event over clever mutation.

**Verify**:
`npx vitest run src/lib/matching/history.test.ts` exits 0 and the test names
state the distinct-event semantics.

### Step 5: Run the full local gate

Run:

1. `npm test`
2. `npm run typecheck`
3. `npm run lint`

The first two must exit 0. Lint may still report the pre-existing
`members-leaderboard.tsx` anchor error and two unused-symbol warnings scheduled
for plan 004, but it must report no new problem in an in-scope file.

## Test plan

- Explicit affirmative, negative, missing, and unfamiliar Luma values.
- Check-in-time precedence over the boolean/status column.
- Luma and Engage rows with identity errors are absent from member history.
- Duplicate rows never add multiple attendance credits.
- One person attending two valid events has `attendedCount === 2`.
- One person appearing twice in one ambiguous event receives no derived credit
  for that event.
- Fake data only.

## Done criteria

- [ ] Focused tests exit 0 with the new regression cases.
- [ ] `npm test` exits 0.
- [ ] `npm run typecheck` exits 0.
- [ ] No catch-all branch classifies an unfamiliar `checkedIn` value attended.
- [ ] `attendedCount` is derived from distinct valid event IDs.
- [ ] No source parser or persistence file changed.
- [ ] Only in-scope files appear in `git status --short`.
- [ ] Plan 001 is marked `DONE` in `plans/README.md`.

## STOP conditions

- A parser no longer attaches identity issues to ambiguous rows.
- Product intent has changed to count check-in rows rather than events.
- Correctness appears to require choosing one duplicate row as canonical.
- An in-scope source file has materially drifted from the excerpts.
- A verification step fails twice after a reasonable fix attempt.

## Maintenance notes

Member history is a derived view; source rows and their issues must always stay
available in Upload and Supabase. If a future export introduces warning-only
issues, reviewers should decide explicitly whether warnings are safe for member
history rather than treating all issue codes alike by accident.
