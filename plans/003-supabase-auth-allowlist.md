# Plan 003: Lock attendance data behind an email allowlist

> **Executor instructions**: This plan includes source changes and external
> Supabase configuration. Never invent provider settings or deploy SQL without
> operator approval. Stop on a STOP condition. Update `plans/README.md` only
> after both source and live-policy verification are complete.
>
> **Drift check (run first)**:
> `git diff --stat 4411f449..HEAD -- supabase/schema.sql src/lib/supabase/client.ts src/app/layout.tsx src/app/page.tsx src/app/members/page.tsx`
> Changes from plan 002 in `supabase/schema.sql` are expected and must be
> preserved. Any other semantic mismatch requires reconciliation before work.

## Status

- **Priority**: P1
- **Effort**: L (multi-day including provider setup and policy verification)
- **Risk**: HIGH — incorrect RLS can expose data or lock out operators
- **Depends on**: `plans/002-atomic-supabase-saves.md`
- **Category**: security
- **Planned at**: commit `4411f449`, 2026-08-07

## Why this matters

The browser receives the Supabase URL and anonymous key by design. Current RLS
policies use `using (true)` and `with check (true)`, so direct Supabase API
access is not protected by Vercel's website password. Attendance names, emails,
and original CSV rows must be limited to authenticated tech@nyu operators.

Use an explicit email allowlist rather than every `@nyu.edu` account. This is a
small operator tool, and the narrower policy matches least privilege without
adding member ownership or a CRM model.

## Current state

- `supabase/schema.sql:51-60` enables RLS but grants all operations to everyone:

  ```sql
  create policy "allow_all_events" on events
    for all using (true) with check (true);
  ```

- `src/lib/supabase/client.ts` creates an anonymous browser client and already
  supports Supabase Auth session storage implicitly through `createClient`.
- `src/app/layout.tsx` renders all routes without an authentication gate.
- Both pages load data from Supabase immediately on mount.
- `AGENTS.md` names allowlist/RLS as the next access milestone and forbids a
  `members` table. An `allowed_emails` operator table is not a member CRM.
- The UI must remain simple, internal, and useful. Do not add roles, teams,
  invitations, profiles, or ownership rules.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Tests | `npm test` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 after plan 004, or only its documented pre-existing findings if plan 004 has not run |
| Build | `npm run build -- --webpack` | exit 0; `/` and `/members` generated |

## Scope

**In scope:**

- `supabase/schema.sql`
- `src/lib/supabase/client.ts` only if a small auth helper belongs there
- `src/components/auth-gate.tsx` (create)
- `src/app/layout.tsx`
- `docs/access-control.md` (create; operator setup only)
- `plans/README.md` for status only

**Out of scope:**

- A `members` table or CRM profiles
- Per-event ownership; allowlisted operators share the same workspace
- Broad `*.nyu.edu` access
- Custom SMTP, invitations, roles, admin UI, or user management screens
- Service-role keys in browser code or any `NEXT_PUBLIC_` variable
- Changes to parsing, matching, or persistence payloads

## Git workflow

- Branch: `codex/repair-003-supabase-auth-allowlist`
- Suggested commit: `Protect attendance data with an operator allowlist`
- Do not push, deploy, or open a PR unless explicitly asked.

## Steps

### Step 1: Confirm the authentication method and URLs

Recommend Supabase email OTP/magic-link authentication because the tool has a
small operator group and no password-management requirement. Before coding,
the operator must confirm:

- the production site URL
- allowed localhost and preview redirect URLs
- at least one initial operator email
- that Supabase email authentication is enabled

Record only placeholder examples in docs. Never commit real allowlisted emails,
keys, or tokens.

**Verify**: The operator confirms the four items. Otherwise stop.

### Step 2: Add the allowlist and policy helper

In `supabase/schema.sql`:

1. Create `public.allowed_emails` with normalized lowercase `email` as its
   primary key and timestamps only if operationally useful.
2. Enable RLS on it. Do not create a client-readable policy; operators manage
   allowlist rows in the Supabase dashboard/SQL editor for now.
3. Create a small stable `public.is_allowed_operator()` SQL function that
   checks the authenticated JWT email against `allowed_emails`.
4. If the function needs `security definer` solely to read the protected
   allowlist, set an explicit `search_path`, revoke public execution, and grant
   execution only to `authenticated`. Do not accept caller-controlled input.
5. Drop the two `allow_all_*` policies.
6. Add explicit `select`, `insert`, `update`, and `delete` policies for
   `authenticated` users on both `events` and `event_rows`, each gated by
   `is_allowed_operator()`. Shared operators can access all workspace rows.
7. Ensure the atomic save RPC from plan 002 remains `security invoker` so the
   caller's RLS applies.

Do not make `allowed_emails` writable from the browser.

**Verify**: Query `pg_policies`; expect no policy whose expression is simply
`true`, no `anon` policy on attendance tables, and allowlist-gated policies for
all four operations.

### Step 3: Add a minimal authentication gate

Create `src/components/auth-gate.tsx` as a client component and wrap `children`
with it from `src/app/layout.tsx`.

The gate should:

- obtain the current session on mount
- subscribe to `onAuthStateChange` and unsubscribe on cleanup
- show a small email form while signed out
- call `signInWithOtp` using the current origin as the return URL
- show a neutral “check your email” state after submission
- render application children only for an authenticated session
- surface a useful generic error without exposing tokens or raw Supabase errors
- offer sign-out in a small authenticated workspace header/control

RLS, not this component, is the authorization boundary. A signed-in but
non-allowlisted user will receive a data-access error; show a clear “This email
is not allowed for this workspace” message without revealing the allowlist.

Reuse existing CSS variables and button/input styles. Do not redesign the app.

**Verify**: `npm run typecheck` and `npm run build -- --webpack` exit 0.

### Step 4: Write operator-only setup instructions

Create `docs/access-control.md` covering:

- enabling email OTP/magic links
- setting site and redirect URLs
- adding/removing a normalized email via the Supabase dashboard using
  placeholders only
- applying the schema change
- the difference between the public anon key and a forbidden browser-side
  service-role key
- a rollback procedure that restores access only for a named emergency
  operator, not anonymous `using (true)` policies

Do not put production URLs, real emails, or keys in the file.

### Step 5: Verify all four authorization cases

With fake data in an operator-approved Supabase environment, verify:

1. Signed out: cannot select, insert, update, delete, or invoke the save RPC.
2. Authenticated but not allowlisted: same denials.
3. Authenticated and allowlisted: can load, save, replace, and delete fake
   events through the app.
4. Removing the email from the allowlist revokes access on the next request or
   session refresh.

Use browser/application behavior and Supabase logs. Do not print session tokens
or attendee payloads. After external verification, run all local commands.

## Test plan

- Existing unit tests must remain green.
- Typecheck and build cover auth API integration.
- Manual policy matrix covers anonymous, authenticated-denied, authenticated-
  allowed, and revoked states.
- Atomic RPC is tested under both denied and allowed identities.
- Only fake attendee rows are used.

## Done criteria

- [ ] No unconditional attendance-table RLS policy remains.
- [ ] Anonymous users cannot read or mutate attendance data or call the save RPC.
- [ ] Only authenticated allowlisted emails can use the shared workspace.
- [ ] `allowed_emails` cannot be read or modified through the browser client.
- [ ] No service-role key or real operator email is committed.
- [ ] Auth subscription cleanup exists.
- [ ] Tests, typecheck, and webpack build exit 0.
- [ ] `docs/access-control.md` contains complete placeholder-only setup steps.
- [ ] Plan 003 is marked `DONE` only after live/disposable policy verification.

## STOP conditions

- The operator has not confirmed auth method, redirect URLs, and an initial
  allowlisted email.
- Plan 002's save RPC is missing or uses `security definer`.
- Testing requires production attendee data.
- The proposed policy needs a service-role key in client code.
- Applying policy changes would lock out the only operator without a tested
  rollback path.
- Supabase Auth behavior differs from the source assumptions.

## Maintenance notes

Allowlist management intentionally stays in Supabase for now. Do not add an
admin screen until organizers explicitly request it. Review RLS whenever a new
table or RPC is added; wrapping routes in `AuthGate` does not authorize database
access by itself.
