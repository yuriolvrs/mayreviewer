# Account / Settings Split — As Built

Implemented and committed (f9cccb7). This doc records what shipped, including
where it diverged from the original plan.

## Structure

- `/settings` — functional settings only: Study defaults, Appearance,
  Reminders, Data. The Account, Plan, and About sections are gone (the plan
  only called for Account to move). Legal links and the version row still
  live on `/about` and in the layout footer, so nothing orphaned — but note
  the "Free plan" note has no surface anymore. If plan copy matters later,
  it needs a home.
- `/account` — an identity header (avatar, handle, email, Log out), then
  sections: Profile (display name, edited inline), Sign-in methods (Google
  status when linked, Password with the change/set dialog), Sync (last
  synced + Sync now), Shares, and a separate Delete account row at the
  bottom. Logged-out state is a "Sync your reviewers" pitch with a Sign in
  button; unconfigured builds show a note. The reset-link dialog has a
  client-side limit (60s cooldown, 3 sends per hour, kept in localStorage);
  Supabase's own rate limits are the real guard.
  Cross-links: Navbar menu carries the Account item (with active state);
  BottomBar unchanged (no fifth tab), as planned.

## Beyond the plan

Two features were built that the plan listed as non-goals:

- **Display name** — stored in Supabase auth `user_metadata`, so it roams
  with the account. Caveat: it is NOT in the export-all backup (that covers
  settings/reviewers/attempts only). Acceptable — the cloud is its backup —
  but don't claim exports are complete accounts.
- **Change password** — opens a dialog (`PasswordDialog`). Two paths:
  - Current password: email users enter it, we check it with
    `signInWithPassword`, then call `updateUser` with `current_password`.
  - Reset link: `resetPasswordForEmail` sends Supabase's default "Reset
    password" email, which lands on `/auth/reset`. That link gives a
    recovery session, so `updateUser` needs no `current_password` there.
    Google-only users ("Set a password") always use this path. Email users
    who forgot the password use it too.
  - There are no emailed codes. Editing Supabase email templates needs
    custom SMTP, and the project has no domain.
  - After any successful update we store `password_set: true` in
    `user_metadata`, because Supabase adds no "email" provider when an
    OAuth user sets a password. `hasPassword()` reads that flag. Eye
    toggles are shared with `/login` via `PasswordInput`.
- **Supabase setup needed:**
  - Add `<site>/auth/reset` (localhost and production) to Authentication →
    URL Configuration → Redirect URLs.
  - Turn on "Require current password when updating". The browser-side
    check can be bypassed by anyone holding the session token; this
    enforces it on the server.
  - The built-in mailer only delivers to project team members and is
    rate-limited. Real users need custom SMTP before launch.

## Preserved behaviors

- Delete flow unchanged: confirm dialog → `wipeAccountData` → sign out →
  `/goodbye` (comment updated to the new location).
- Logout still flush-then-clears with the offline-kept notice; the
  account-switch guard in AuthProvider is untouched.
- `SETTINGS_CHANGED_EVENT` listener stays on Settings (functional controls);
  Account renders no settings values, so it needs none. `SYNC_APPLIED_EVENT`
  subscriptions (home, history, formats, `useFormats`) untouched.
- No storage-key or sync-protocol changes; view-layer move only, as planned.

## Test status

Covered by the standard gate (tsc, lint, unit, build) at commit time. No
dedicated e2e for the account flows yet — display-name save, password
change, and the delete-account path are manual-test only. Worth one spec if
account edits keep growing.

*Planned: 2026-09-13. Built (with extras): 2026-09-13.*
