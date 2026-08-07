# Plan 004: Restore lint and keyboard access on Members

> **Executor instructions**: Implement only this small UI-quality milestone.
> Run every verification command and stop on a STOP condition. Update the
> status in `plans/README.md` when complete.
>
> **Drift check (run first)**:
> `git diff --stat 4411f449..HEAD -- src/components/members-leaderboard.tsx src/components/attendance-csv-importer.tsx`
> Plan 001 may change member data semantics but should not change this component.
> Reconcile any component drift before proceeding.

## Status

- **Priority**: P2
- **Effort**: S (hours)
- **Risk**: LOW — interaction semantics change without changing data
- **Depends on**: `plans/001-attendance-correctness.md`
- **Category**: dx
- **Planned at**: commit `4411f449`, 2026-08-07

## Why this matters

The current lint command fails, so agents cannot use it as a clean completion
gate. Members are opened through a mouse-only table-row click, while the product
brief requires WCAG 2.2 AA keyboard access. The modal also lacks Escape handling
and initial/restored focus. This plan restores a green lint baseline and makes
the existing interaction usable without adding a UI library or redesign.

## Current state

- `src/components/members-leaderboard.tsx:119` uses an internal `<a href="/">`,
  which fails Next.js lint.
- `src/components/members-leaderboard.tsx:156-160` attaches `onClick` to `<tr>`;
  the row is not focusable or keyboard-operable.
- `MemberDetail` has `role="dialog"` and `aria-modal="true"` but does not focus
  the dialog, close on Escape, or restore focus.
- Search recomputes `rank = idx + 1` from filtered rows, so a globally lower-
  ranked member is displayed as rank 1 after search.
- `src/components/attendance-csv-importer.tsx` has an unused `source` variable
  near the event list and an unused `Stat` component near the end.
- Use built-in React/DOM behavior; do not add a component or accessibility
  dependency.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Lint | `npm run lint` | exit 0, zero errors and warnings |
| Typecheck | `npm run typecheck` | exit 0 |
| Tests | `npm test` | exit 0 |
| Build | `npm run build -- --webpack` | exit 0 |

## Scope

**In scope:**

- `src/components/members-leaderboard.tsx`
- `src/components/attendance-csv-importer.tsx` only to remove the two unused
  symbols
- `plans/README.md` for status only

**Out of scope:**

- Member aggregation or attendance semantics
- Visual redesign, animation, export, sorting controls, or new dependencies
- Authentication or persistence
- A full reusable modal framework

## Git workflow

- Branch: `codex/repair-004-members-accessibility`
- Suggested commit: `Restore keyboard access on Members`
- Do not push or open a PR unless asked.

## Steps

### Step 1: Restore the lint baseline

- Import `Link` from `next/link` and replace the internal Upload anchor.
- Remove the unused `source` destructuring from the session event list.
- Remove the unused `Stat` component rather than suppressing warnings.
- Do not add ESLint disable comments.

**Verify**: `npm run lint` exits 0 with zero warnings.

### Step 2: Make the member control semantic

Remove the click handler and pointer cursor from `<tr>`. Put a real `button`
around the member name/email in the Member cell. The button must:

- open the existing modal with Enter or Space through native button behavior
- have a clear accessible name
- expose `aria-haspopup="dialog"` and `aria-expanded`
- retain the current selected-row visual treatment

Do not make every cell a separate button and do not use `tabIndex` plus custom
key handlers on the row when a native button is sufficient.

**Verify**: Keyboard-only manual test can tab to a member and open the dialog
with Enter and Space.

### Step 3: Preserve global leaderboard rank during search

Derive rank from the original sorted `members` array, keyed by
`normalizedEmail`, rather than from the filtered array index. Keep search
filtering unchanged.

**Verify**: Search for a member who is not globally first; their displayed rank
remains their original leaderboard rank.

### Step 4: Add minimal dialog keyboard behavior

In `MemberDetail`:

- capture the element focused immediately before the dialog mounts
- focus the top Close button after mount
- listen for Escape and call `onClose`
- remove the listener and restore prior focus on unmount when the element still
  exists

Keep click-outside close. Do not implement a custom focus-trap framework in this
milestone; native controls, initial focus, Escape, and restoration are the
bounded requirement.

Use `useEffect` and `useRef`, with cleanup. Avoid global listeners outside the
component lifecycle.

**Verify**: Keyboard-only manual test opens the modal, focus lands on Close,
Escape closes it, and focus returns to the member button.

### Step 5: Run the full gate

Run lint, typecheck, tests, and webpack build. All must exit 0. Review
`git status --short`; only in-scope source files and the plan index may change.

## Test plan

No React testing library is installed, and adding one is outside this small
milestone. Use the existing compile/lint gates plus these manual checks:

- internal Upload navigation works without full-page errors
- member button opens with keyboard
- Escape closes the dialog
- focus returns to the trigger
- click-outside and both Close buttons still work
- filtered rank remains the global rank
- mouse selection remains usable

Use fake stored events if data is needed.

## Done criteria

- [ ] `npm run lint` exits 0 with zero warnings.
- [ ] Typecheck, tests, and webpack build exit 0.
- [ ] No clickable `<tr>` remains.
- [ ] Internal navigation uses `next/link`.
- [ ] Member dialog opens by keyboard, closes on Escape, and restores focus.
- [ ] Search does not renumber leaderboard ranks.
- [ ] No dependency, data, persistence, or visual-system file changed.
- [ ] Plan 004 is marked `DONE`.

## STOP conditions

- Plan 001 changed the Member interface so the component excerpts no longer
  apply.
- Correct focus restoration appears to require changing navigation or page
  state outside this component.
- Lint failures remain in files outside this plan's in-scope list.
- A new dependency appears necessary.

## Maintenance notes

If a reusable modal appears elsewhere, extract shared dialog behavior in a
separate requested milestone. Reviewers should reject div/row key handlers that
recreate button semantics and should manually verify focus restoration.
