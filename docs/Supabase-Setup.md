# Supabase Setup — Phase 4 Sync + Auth

Code is done and verified local-only. These steps connect it to a real
project. Nothing here is committed — keys live in `.env.local` (gitignored).

## 1. Create the project

1. Go to https://supabase.com/dashboard > New project.
2. Name it `mayreviewer`, pick a region near you, set a database password
   (store it in a password manager — you won't need it for the app).
3. Wait for provisioning (~2 min).

## 2. Run the schema migration

1. Open SQL Editor > New query.
2. Paste the full contents of `supabase/migrations/0001_init.sql` and Run.
3. Expect `Success. No rows returned` — it creates `reviewers`, `attempts`,
   `formats`, `settings` plus owner-only row-level-security policies.

## 3. Auth URL configuration

Authentication > URL Configuration:

- Site URL: `http://localhost:3000` for now (change to the production
  domain when deployed).
- Redirect URLs: add both
  - `http://localhost:3000/auth/callback`
  - `https://YOUR-PROD-DOMAIN/auth/callback` (when it exists)

Email auth works with Supabase's built-in sender for testing (rate-limited).
Optional: Authentication > Providers > Email > turn OFF "Confirm email" for
frictionless dev logins — the app handles both states (it shows "check your
inbox" when confirmation is on).

## 4. Google sign-in

1. https://console.cloud.google.com > New project (any name) > APIs & Services >
   Credentials > Create Credentials > OAuth client ID > Web application.
2. Authorized redirect URI: `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
   (find the ref in Supabase Settings > General > Reference ID).
3. Copy the Client ID + Client Secret into Supabase:
   Authentication > Providers > Google > enable, paste both, Save.

## 5. Wire the app

Add to `.env.local` (see `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... (Project Settings > API > anon public)
```

Restart `npm run dev`. Settings > Account should offer "Sign in to sync".

## 6. Verify end-to-end (Phase 4 "done when")

1. **Login merge:** with local reviewers on this device, sign in — they
   appear in Table Editor > reviewers within a minute, and Settings shows
   "Last synced …".
2. **Two-device sync:** sign in on a second browser/device — reviewers,
   history, custom formats, and settings arrive. Edit on one side, Sync now
   on the other.
3. **Logout/login restore:** log out — the device empties after flushing to
   the cloud (offline: rows stay, with a notice). Log back in — data pulls
   back down.
4. **Delete:** Settings > Account > Delete account — Table Editor shows zero
   rows for the user, local store is empty, you land on `/goodbye`.
5. **RLS negative test:** with two test users, run as user B in SQL Editor
   (or a second signed-in browser via Table Editor):
   `select * from reviewers;` must return only B's rows — never A's. Signed
   out, the same query returns nothing (policies require `auth.uid()`).

## Cost notes

- Free tier covers this workload many times over (500 MB database; rows are
  small JSON). No Storage bucket is used — attachments stay device-local by
  design, so there is no bandwidth bill from files.
- If a table ever feels big, Table Editor > reviewers shows per-row size;
  the quota warning in Settings > Data still guards the device side.
