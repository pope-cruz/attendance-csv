## Project

This is a small tech@nyu attendance tracking tool.

It imports CSVs from Luma and NYU Engage formatted CSV files. This reconciles attendance and eventually builds a member history.

This is not a SaaS product. Optimize for
1. correctness
2. readability
3. ease of maintenance
4. fast internal use

## Working style

- build slow, implement one milestone at a time, if there is a lot of work, push back and do not implement all at once
- this is also meant to be a learning opportunity, take your time to explain the work, and write code that is concise and easy to understand
- before coding, summarize planned changes, if called for default to plan skill before implementing
- after coding, summarize what changes have been implemented, and every file modified
- point out the biggest changes I should read to build context
- prefer simple to explain code over clever abstractions
- do not use a library unless it removes meaningful complexity
- do not refactor unrelated code
- stop when milestone is complete

## Stack
- next.js app router
- tailwind css 4
- papa parse
- vitest
- supabase-js for persistence (IndexedDB removed — app now always uses Supabase)
- browser-side csv parsing, then save to Supabase
- no auth yet (Vercel password protection for now)

Keep these concerns separate:

- source-specific CSV parsing
- normalization
- matching and reconciliation
- persistence
- UI

Suggested structure:

text
src/
  app/
    page.tsx (Upload)
    members/page.tsx (Members leaderboard)
  components/
    attendance-csv-importer.tsx
    members-leaderboard.tsx
    site-nav.tsx
  lib/
    csv/
      luma.ts
      engage.ts
      import.ts
    matching/
      normalize.ts (shared header + email helpers)
      history.ts (groupByMember for leaderboard)
    attendance/
      classify.ts
      summary.ts
    persistence/
      supabaseEvents.ts (only persistence — IndexedDB removed)
    supabase/
      client.ts
    types/

- Do not place parsing or matching logic directly inside React components.

## Data rules
- Email is the primary identity key.
- Normalize emails by trimming and lowercasing.
- Never silently merge ambiguous people.
- Never silently discard malformed rows.
- Preserve the original source row for debugging.
- Extra CSV columns should not break imports.
- Missing optional fields should not break imports.
- Source formats may change, so detect headers by column names rather than fixed positions.

## Code quality
- Strict TypeScript
- Avoid any — pure functions for parsing, normalization, and matching
- Tests for edge cases
- Clear names over short names
- Comments only for non-obvious logic
- Useful error messages for operators

## Privacy
- Use fake data in fixtures and tests.
- Do not commit real attendee names, emails, or phone numbers.
- CSV processing happens locally in the browser before save to Supabase; original rows are kept for debugging.

## Where we are (in sync with codebase)

Parsing is done and intentionally kept separate:
- Luma: `luma.ts` handles `Name / Email / Check-in Time / Checked in at / Checked In (Yes/No) / Approval Status / Registration Status / Ticket Type` via header aliases; classification is `checkInTime` or `checkedIn=Yes` → attended, otherwise RSVPed vs not attended
- Engage: `engage.ts` finds the header past the preamble, picks the single NYU email (`campusEmail` vs `preferredEmail`), classification is `attendanceStatus === "Attended"` → attended
- `import.ts` only identifies (`luma` vs `engage` vs `unknown/ambiguous`) and dispatches — no merged parser
- `matching/normalize.ts` is the single source for `normalizeHeader`, `normalizeEmail`, `EMAIL_PATTERN`, `isNyuEmail`

Attendance is explicit:
- `attendance/classify.ts` decides attended; `attendance/summary.ts` aggregates `attended / sourceRowCount` (bullshit KPIs removed — UI now shows just "Who attended: X of Y")
- UI shows `Attended` (green) vs `RSVPed — Not checked in but approved • registered` (amber) vs `Not attended`

Persistence is Supabase-only:
- `persistence/events.ts` (IndexedDB) and its test were removed; `persistence/index.ts` now re-exports `supabaseEvents.ts` directly
- `supabase/client.ts` reads `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `.env.local` (gitignored via `.env*`) and `.env.example`; Vercel needs same vars in Dashboard
- `supabase/schema.sql` creates `events` + `event_rows` (with `email` index, `original_row jsonb`, `attended` boolean, `rsvp_label`); RLS is open `allow_all` for now

UI is two tabs sharing Supabase:
- `Upload` (`/`) — drop CSV, review `Attended?` table, add event; footers now say "Saved to Supabase and shared"
- `Members` (`/members`) — leaderboard via `matching/history.ts` `groupByMember` sorted by most attended, search, click name → popup modal (click-out to close) with all events for that person; same Supabase data, no local-only copy

## Eventual direction

These were future capabilities — first three are now done, do not rebuild them:
- [done] Attach confirmed attendance imports to events.
- [done] Store multiple events and report simple event-over-event KPIs (now just "Total attended across saved events").
- [done] Database persistence — Supabase with `events` + `event_rows`; Vercel password protection covers Titus for now.
- [next] Tighten access: replace Vercel password with Supabase Auth + allowlist (`allowed_emails` table) or `*.nyu.edu` check when you need per-person control
- Only then consider lightweight CRM with member profiles and richer history — not an export, not edits to past rows

Do not build ahead of the milestone explicitly requested.

## Current milestone

Parsing is 100% — leave `luma.ts` and `engage.ts` separate, only `matching/normalize.ts` is shared.

Next milestone is small and Supabase-aware (pick one, ship, stop):
1. tighten access *or* members polish — not both: either add allowlist/RLS (lock `events`/`event_rows` to authenticated + `allowed_emails`) *or* add a tiny export of attended emails from Members popup. Do not add a `members` table yet — keep leaderboard derived via `groupByMember`.
2. after that, consider member search polish or past-event edits — only if organizers ask.

Only implement the milestone stated in the current task prompt.
