# Parsing Overview — Layman's Terms

> Luma and NYU Engage stay separate. No merging. This is the whole parsing story.

## In one sentence
You drop an unmodified CSV from Luma **or** NYU Engage. The app figures out which one it is by reading the column names, sends it to the right small parser, checks every row, and shows you what is clean and what needs review. The original CSV text is always kept.

## The two guest lists — why they must stay separate

**Luma** looks like this (header on the very first line):
```
Name, Email, Approval Status, Registration Status, Check-in Time, Ticket Type
Avery Stone, avery@example.com, approved, registered, 2026-07-20 18:05, Member
```
It also accepts aliases like `Guest Email`, `Guest First Name` / `Guest Last Name`, `Checked in at`.

**NYU Engage** looks like this (a little cover page first, then the header):
```
Event Attendance By Event
Community Demo Night
Start Date, 3/23/2026
End Date, 3/23/2026
First Name, Last Name, Campus Email, Preferred Email, Attendance Status, Marked By, Marked On, Comments, Card ID Number
Avery, Stone, avery.stone@nyu.edu, avery@example.com, Attended, ...
```
The real header can be 5–8 rows down. The parser finds it by scanning for `Attendance Status` + `Campus Email` or `Preferred Email`.

If we tried to use one parser for both, we'd have to guess where the header starts in every file — that's the headache you flagged. So we keep them in two files:
- `src/lib/csv/luma.ts` — only Luma
- `src/lib/csv/engage.ts` — only Engage
- `src/lib/csv/import.ts` — just the receptionist that *identifies* ("is this Luma? Engage? unknown? ambiguous?") and dispatches.

Adding a third source later = add `src/lib/csv/newSource.ts` + one name check in `import.ts`. Nothing else moves.

## What "parsing is done" means — checklist in plain English

| Rule from AGENTS.md | What it means for you | Where it lives | Proof |
|---|---|---|---|
| Email is the ID | The email is the person. We trim spaces and make it lowercase (`Alex@NYU.EDU` → `alex@nyu.edu`) so `AVERY.STONE@EXAMPLE.COM` and `avery.stone@example.com` are the same person. | `src/lib/matching/normalize.ts` (`normalizeEmail`, `normalizeHeader`, `EMAIL_PATTERN`) | `normalize.test.ts` (8 tests), `luma.test.ts:6` |
| Extra columns don't break | If Luma adds `Company, Notes` or Engage adds a new column, we keep it and show it. | `luma.ts:toSourceRow`, `engage.ts:toSourceRow` | `luma.test.ts:29`, `engage.test.ts:67` |
| Missing optional fields don't break | If `Ticket Type` or `Comments` is empty, we still import. | same parsers | same tests |
| Headers by name, not position | We look for names like `Email` / `Campus Email` case-insensitively, with `BOM`, `_`/`-` → space handling, so shifting columns is fine. | `normalizeHeader` in `normalize.ts` | `normalize.test.ts` |
| Original row kept | We never throw away what you uploaded. `originalRow` stores the exact text for debugging. | `toSourceRow` in both parsers | `luma.test.ts:24`, `engage.test.ts:62` |
| Bad rows stay visible | A bad email or extra value doesn't disappear — it gets a red `Review` badge with `invalid_email`, `malformed_csv` etc. | `issues` array on each row | `luma.test.ts:63,89`, `engage.test.ts:144,172` |
| Duplicate people are flagged, not merged | If `sam.rivera@example.com` appears twice (even as `SAM.RIVERA@EXAMPLE.COM`), both rows get `duplicate_email` and stay separate. We never guess which name is right. | `addDuplicateEmailIssues` in both parsers | `luma.test.ts:75`, `engage.test.ts:155` |
| NYU Engage picks one NYU email only if unambiguous | If `Campus Email` and `Preferred Email` are the same NYU address (different case/spaces) → pick it. If they are two different `@nyu.edu` addresses → no pick, flag `conflicting_nyu_emails`. If none is NYU → flag `missing_nyu_email`. | `engage.ts:addEmailIssues`, `isNyuEmail` | `engage.test.ts:90,120,133` |

**Result in the UI:** After you drop a file you see `Source auto-detected: Luma` or `NYU Engage`, then `Attendance classification` (attended/unknown), `Import quality` (source rows / ready / needs review), plus a full table with `Normalized identity` vs `Source status` vs `Validation`. Every file stays in this browser.

## What "done" does NOT include

- No cross-source merging of Luma + Engage into one list
- No member history or database
- No silent fixing

Those are separate future tracks.

## Future tracks — you can read and pick

### Track A — Small member lookup (no database, 5–6h, local only)
A read-only search box: type `alex@nyu.edu` and see which saved events that normalized email showed up in (with `attended` vs `unknown` per event). Uses `normalizeEmail` again, never writes. Good for proving whether repeat attendees are real before you lock a database schema.

### Track B — Database (3–4 days when you want it)
Two tables: `events` (id, name, dates, fileName, savedAt) + `attendees` (normalizedEmail, source, rowNumber, originalRow JSON, issues), indexed on `normalizedEmail`. Lets you share across devices and keep history long-term. The 5 metrics that justify it (track them now locally, persist later):
1. `resolved / total` — how clean are the emails?
2. `attended by source` — is Luma check-in more reliable than Engage status?
3. `repeat rate` — distinct emails with ≥2 events / distinct emails
4. `invalid + duplicate` trend event-over-event
5. `total events / rows` — when do you need indexing?

We will only do B after A shows real repeat patterns.

## How to verify parsing is 100%
Run `npx tsc --noEmit` (0) and `npx vitest run` (10 files, 61 tests). Try dropping: a Luma export with `Guest_Email` + extra column, an Engage export with a shifted header, and one with `ALEX@NYU.EDU` vs `alex@nyu.edu` — all should import and the duplicate normalized email should be flagged, not merged.

## Biggest files to read if you want context
- `src/lib/csv/luma.ts` — Luma-specific header aliases + per-file duplicate logic
- `src/lib/csv/engage.ts` — metadata scan + NYU email picking
- `src/lib/csv/import.ts` — the identifier/dispatcher
- `src/lib/matching/normalize.ts` — the only shared helper (5 functions)
- `src/lib/attendance/summary.ts` — event-over-event totals
