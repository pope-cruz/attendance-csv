# Shared organizer access

This setup gives organizers one shared password while keeping attendance data
behind Supabase Auth. The password lives only in Supabase; do not add it to the
repository or to Vercel environment variables.

## 1. Create the shared Supabase user

1. Open the Supabase project.
2. Go to **Authentication → Providers → Email** and keep email/password enabled.
3. Turn off **Allow new users to sign up**. The app has no sign-up screen, but
   disabling this setting also prevents someone from creating an account by
   calling the Auth API directly.
4. Go to **Authentication → Users → Add user → Create new user**.
5. Use a team-controlled address such as `organizers@your-domain.edu` and a
   strong shared password. Mark the user as confirmed if the dashboard asks.
6. Check the Users list and remove any test accounts that should not have access.

Share the password through the team's password manager, not email or source code.

## 2. Configure the app

Add the shared account's email—not its password—to `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
NEXT_PUBLIC_SUPABASE_OPERATOR_EMAIL=organizers@your-domain.edu
```

The URL and anon key are browser-safe identifiers. Database access is enforced
by Row Level Security and the signed-in user's session.

In Vercel, add `NEXT_PUBLIC_SUPABASE_OPERATOR_EMAIL` under **Project → Settings
→ Environment Variables** for Production and Preview. Confirm the existing URL
and anon key are set for the same environments, then redeploy. Do not put the
shared password in Vercel.

## 3. Verify login before locking the database

Open the new deployment in a private browser window:

1. Confirm the password screen appears.
2. Confirm a wrong password is rejected.
3. Sign in with the shared password and confirm Dashboard, Upload, and Members load.
4. Sign out and confirm the password screen returns.

At this point the UI requires login, but the old anonymous database policy still
exists until the next step.

## 4. Lock Supabase to authenticated users

In **Supabase Dashboard → SQL Editor → New query**, first paste and run the
complete current contents of [`supabase/schema.sql`](../supabase/schema.sql).
This applies additive schema changes and creates the row-resolution function.
Then paste and run [`supabase/enable-shared-auth.sql`](../supabase/enable-shared-auth.sql).

The result table should list privileges for `authenticated` and none for `anon`.
Refresh the signed-in app and verify existing events still load. Then sign out
and sign back in once more.

## Rotating access

Change the shared user's password in **Authentication → Users** and distribute
the replacement through the password manager. Existing browser sessions may
remain valid until their tokens expire or are revoked, so use Supabase's user
session controls if access must be removed immediately.

`supabase/restore-anon-access.sql` is an emergency rollback. Running it makes the
database anonymous again; do not use it as a normal troubleshooting step.
