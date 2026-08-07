# Plan: Shared Normalization — Keep Luma & Engage Parsers Separate

> One milestone. No DB, no auth. Pure functions only, browser-local.
> Implements your feedback: Luma and Engage stay modular, no cross-source reconcile port.

## Goal
Deduplicate the shared identity helpers (`normalizeHeader`, `normalizeEmail`, `EMAIL_PATTERN`) without merging the two parsers. Prepares for future sources without introducing the row-offset headache (Engage header starts after 5 metadata rows, Luma at row 0).

## Current state (verified 2026-08-07)
- `src/lib/csv/luma.ts` and `engage.ts` and `import.ts` each defined `normalizeHeader` independently; `EMAIL_PATTERN` duplicated; `normalizeEmail` only in `engage.ts`.
- **Now fixed:** `src/lib/matching/normalize.ts` exists and is tested (8 tests), `vitest.config.ts` alias added, `luma.ts`/`engage.ts`/`import.ts` now import from it. `npx tsc --noEmit` 0, `npx vitest run` 10 files / 61 passed.
- `src/lib/attendance/classify.ts` + `summary.ts` already isolate attendance signal vs identity; `SessionEventsSummary` provides event-over-event KPIs in `attendance-csv-importer.tsx`.
- No cross-source reconcile — intentional. `AGENTS.md` says keep source-specific parsing separate.

## This milestone is DONE — what was done
1. `src/lib/matching/normalize.ts` — `normalizeHeader` (BOM/trim/lower/_-→space/collapse), `normalizeEmail` (trim+lower), `isValidEmail`, `isNyuEmail`, `EMAIL_PATTERN` (`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
2. Refactor `luma.ts`/`engage.ts`/`import.ts` to import helpers (no behavior change, `Luma buildAttendee` now uses `normalizeEmail`)
3. `src/lib/matching/normalize.test.ts` + `vitest.config.ts` alias fix

## Out of scope (deferred per your note)
- No `reconcileByEmail(sessionEvents)` that joins Luma+Engage rows — would hide per-source row-start differences and prematurely merges identities. Duplicate detection stays per-file (`addDuplicateEmailIssues` in each parser).
- No persistence/UI change.

## Next suggestion toward database — what to build before DB (and what metrics justify it)

### Why not DB yet
The current IndexedDB (`src/lib/persistence/events.ts`) is enough for the `attach import to event + multi-event list` milestone and keeps CSV processing local per privacy rule. Moving to a DB now adds auth/permissions overhead before you know which metrics actually matter.

### Recommended next 2 milestones (still DB-free, ~1–2 days total)

**M1: Per-source identity quality report (~3h)**
Add `src/lib/matching/report.ts` that, given a `SessionEventRecord[]`, returns `{ duplicateRows, invalidEmailRows, conflictingNyuRows }` per event without merging sources. UI: small badge in `SessionEventList` ("3 need review"). This directly measures data hygiene and tells you if reconciliation is even needed — cheapest validation.

**M2: Minimal member-history rollup, still in-browser (~5–6h)**
Add `src/lib/matching/history.ts` — `groupByNormalizedEmail(records)` that is **read-only aggregation** (no merge, no write), preserving `originalRow` + source label per occurrence. UI: `Member lookup` input that lists events a normalized email appeared in (attended/unknown). This proves the email-as-primary-key assumption on real data before you commit to a schema.

Only after M1/M2 should you spec the DB, because you'll then know:
- Do you need to store `campusEmail` vs `preferredEmail` separately or just normalized `email`?
- Is `attendanceStatus` normalization enough or do you need to keep raw `checkInTime` text?
- What volume of `duplicate_email` actually occurs cross-event?

### When to add DB (est. timeline)

| Step | Scope | Est. effort | Owner |
|------|-------|-------------|-------|
| Schema design | `events` (id, details, fileName, savedAt), `attendees` (normalizedEmail, source, rowNumber, originalRow JSON, issues), index on `normalizedEmail` | 0.5d | you |
| DB choice | Vercel Postgres / Supabase / SQLite via Turso — all work with Next App Router; pick one with row-level auth if you add logins later | 0.5d decision | you |
| Migration from IndexedDB | `src/lib/persistence/events.ts` → `src/lib/persistence/db.ts` with same `load/save/delete` shape, feature-flagged to keep local fallback | 1d | dev |
| Auth (if needed) | NextAuth + basic role (operator vs viewer) — only then per `AGENTS.md` | 1–1.5d | dev |
| Total DB integration | Schema + wiring + auth | **3–4 days** dev time, plus design review | |

**Most useful metrics to justify the DB** (track these now in-browser, then persist):
1. `resolvedIdentityCount / sourceRowCount` per event and aggregate — hygiene KPI
2. `attendedCount` vs `unknownCount` per source type (Luma check-in vs Engage status) — tells you which source is more reliable
3. Repeat attendee rate: `distinct normalized emails with ≥2 events / distinct emails` — the actual member-history value prop
4. `invalidRowCount` + `duplicate_email` trend event-over-event — operational quality
5. Event count and total rows over time — capacity planning for DB indexing

If those 5 stay healthy in the current local store, the DB is just persistence + sharing; if not, you fix CSV hygiene first. Reconciliation as a cross-source merge only makes sense after M2 proves repeat-email patterns — otherwise it adds complexity for no user-visible gain.

## Verification for today
- `npx tsc --noEmit` — 0
- `npx vitest run` — 61 passed (up from 53)
- Manual: import one Luma + one Engage CSV, confirm `Events` total increments, normalization still lowercases `ALEX@NYU.EDU` → `alex@nyu.edu` in preview.
