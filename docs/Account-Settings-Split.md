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
- `/account` — identity + cloud: signed-in email row, Display name, Sync row
  with Sync now, Change password, Log out, Delete account, plus the
  logged-out "Sign in to sync" CTA and the unconfigured-build note.
  Cross-links: Navbar menu carries the Account item (with active state);
  BottomBar unchanged (no fifth tab), as planned.

## Beyond the plan

Two features were built that the plan listed as non-goals:

- **Display name** — stored in Supabase auth `user_metadata`, so it roams
  with the account. Caveat: it is NOT in the export-all backup (that covers
  settings/reviewers/attempts only). Acceptable — the cloud is its backup —
  but don't claim exports are complete accounts.
- **Change password** — `auth.updateUser`, 6-char minimum, match check, eye
  toggles shared with `/login` via `PasswordInput`. No current-password
  gate and no recovery flow; both are future work if shared-device threat
  models ever demand them.

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
