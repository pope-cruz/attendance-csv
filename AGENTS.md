## Project

This is a small tech@nyu attendance tracking tool.

It imports CSVs from Luma and NYU Engage formatted CSV files. This reconiles attendance and eventually builds a member history.

This is not a SaaS product. Optimize for
1. correctness
2. readability
3. ease of maintenance
4. fast internal use

## Working style

- build slow, implement one milestone at a time, if there is a lot of work, push back and do not implement all at once
-  this is also meant to be a learning opportunity, take your time to explain the work, and write code than is concise and easy to understand
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
- browser-side csv parsing
- no database unless requested
- no auth unless requested

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
  components/
  lib/
    csv/
      luma.ts
      engage.ts
    matching/
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
- Avoid any pure functions for parsing, normalization, and matching
- Tests for edge cases
- Clear names over short names
- Comments only for non-obvious logic
- Useful error messages for operators
Privacy
## Use fake data in fixtures and tests.
Do not commit real attendee names, emails, or phone numbers.
Keep CSV processing local in the browser unless explicitly changed.

## Eventual direction

These are future capabilities, not current requirements:

- Attach confirmed attendance imports to events.
- Store multiple events and report simple event-over-event KPIs.
- Later add database persistence with authentication and basic permissions.
- Only then consider a lightweight CRM with member profiles and attendance history.

Do not build ahead of the milestone explicitly requested.

Current milestone

Only implement the milestone stated in the current task prompt.
