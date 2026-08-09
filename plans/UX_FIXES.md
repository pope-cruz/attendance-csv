# UX integration fixes

> Use this file as the complete handoff for the next UX milestone. Implement
> only the **Current milestone**, run every verification command, summarize the
> files changed, and stop. Do not begin the deferred work.

## Status

- **State:** ready
- **Priority:** P1 integration hardening
- **Effort:** medium
- **Risk:** low to medium
- **Planned at:** commit `06f0155e`, 2026-08-09

## Product constraints

This is a small internal tech@nyu attendance tool, not a SaaS dashboard.
Optimize for correctness, readability, maintenance, and fast operator use.

- Keep Luma and Engage parsing separate.
- Keep member history derived from saved events; do not add a `members` table.
- Preserve original source rows and all attendance classifications.
- Do not change Supabase schema or persistence behavior in this milestone.
- Match the existing Carbon-based UI and plain operator language.

## Drift check

Run before editing:

```sh
git diff --stat 06f0155e..HEAD -- \
  src/components/attendance-dashboard.tsx \
  src/components/attendance-csv-importer.tsx \
  src/components/members-leaderboard.tsx \
  src/app/upload/page.tsx
```

If these files changed semantically, compare the live code against this plan.
Stop and report if the routes, event-selection state, or dashboard event model
no longer match the current state described below.

## Current milestone

Make the new Dashboard, Upload route, and saved-event editor work as one
coherent flow.

### 1. Fix the Members empty-state destination

File: `src/components/members-leaderboard.tsx`

The empty state currently links the word `Upload` to `/`, which is now the
Dashboard. Change the destination to `/upload` and use explicit action copy,
for example `Import attendance CSV`.

Acceptance checks:

- With no members, the empty-state action opens `/upload`.
- The link text describes the action rather than only naming a tab.

### 2. Make Dashboard events open their saved records

Files:

- `src/components/attendance-dashboard.tsx`
- `src/app/upload/page.tsx`
- `src/components/attendance-csv-importer.tsx`

Dashboard event rows are currently static. Make every row a standard Next.js
link to `/upload?event=<event-id>`. The row must remain readable and keyboard
accessible, with a visible `View event` affordance rather than relying only on
an invisible click target.

On Upload, read the optional `event` query parameter and pass it to
`AttendanceCsvImporter`. After saved events load:

- Select the matching event when the ID exists.
- Fall back to the existing latest-event selection when it is absent.
- Ignore an unknown ID safely and show the normal Upload state.
- Move focus to, or scroll to, the selected attendance-review heading after a
  valid deep link so the operator does not have to search down the page.

Do not create a new event-detail route or duplicate the editor.

### 3. Explain reporting-window dates

File: `src/components/attendance-dashboard.tsx`

Add one concise line near the period summaries explaining that semester and
academic-year groupings are based on saved event dates. Do not add tooltips,
documentation panels, or more metrics.

For the `Date needed` group, the event-row link from step 2 is the recovery
path. Its action copy should make it clear that opening the event allows the
date to be corrected.

## Tests

Add focused tests only where logic is extracted or changed. Follow the style of
the existing Vitest files and use fake names and emails.

Minimum cases:

- A valid event query ID selects the requested saved event.
- An unknown event query ID does not crash or hide the saved-event list.
- Dashboard event URLs encode the event ID correctly if URL construction is
  moved into a pure helper.

Do not introduce a browser-testing library solely for this milestone. If a UI
behavior cannot be unit-tested with the current setup, document it in the
manual checklist below.

## Manual verification

Run the app and check:

1. Dashboard event rows are keyboard-focusable and open the matching saved
   event on Upload.
2. A `Date needed` row opens the same event's editor path.
3. Refreshing `/upload?event=<valid-id>` preserves the intended selection.
4. `/upload?event=unknown` falls back safely.
5. Members' empty-state action opens Upload.
6. Desktop and 390px layouts have no horizontal page overflow.

## Required commands

| Purpose | Command | Expected result |
|---|---|---|
| Tests | `npm test` | all tests pass |
| TypeScript | `npm run typecheck` | exit 0, no errors |
| Lint | `npm run lint` | exit 0, no errors |
| Production build | `npm run build` | exit 0 |

## Done criteria

- [ ] Members' empty-state action routes to `/upload`.
- [ ] Every Dashboard event has a visible, keyboard-accessible action.
- [ ] Deep links select the matching saved event after Supabase loading.
- [ ] Invalid event IDs fail safely.
- [ ] Reporting-window date logic is explained in one concise sentence.
- [ ] Tests, typecheck, lint, and production build pass.
- [ ] No parser, matching, persistence, schema, or member-history behavior changed.
- [ ] Only files listed in this plan's current milestone were modified, plus
      focused test files when necessary.

## Stop conditions

Stop and report instead of improvising if:

- Deep linking requires changing the Supabase record shape.
- Next.js query-parameter handling would require moving CSV parsing or matching
  logic into a page component.
- A valid event ID cannot be selected without duplicating persistence state.
- Verification fails twice after a reasonable fix attempt.
- The work expands into a new event-detail route or a general navigation rewrite.

## Deferred after this milestone

Do not implement these in the same pass:

1. Protect unsaved event-detail drafts from top-navigation loss.
2. Redesign the Upload sequence and remove the duplicate `Step 01` framing.
3. Keep attendance counts visible in the mobile Members layout.
4. Finish member-dialog focus containment and enlarge its close target.
5. Add Members sorting, filters, or pagination.
6. Replace free-text event dates or redesign date entry.

These should be reconsidered one small milestone at a time after the Dashboard
integration fixes ship.
