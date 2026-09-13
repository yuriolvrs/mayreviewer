# Account / Settings Split Plan

Implemented 2026-09-13 in one pass (small, mechanical move; no storage or
sync logic changes). This doc is the record.

## Problem

`/settings` mixes two concerns on one page:

- **Account** (who am I, cloud state): sign-in state, email, sync status,
  Sync now, Log out, Delete account data.
- **App settings** (how the app behaves): Study defaults, Appearance,
  Reminders, Data (export / delete-local / quota), Plan, About and legal.

Identity actions deserve their own surface — burying Delete account between
"Reminder time" and "Export backup" undersells its weight, and the page is
long enough that sync status is easy to miss.

## Proposed structure

- `/settings` — functional settings only. Keeps: Study defaults, Appearance,
  Reminders, Data. No cross-link row — the Navbar
  account menu already links both pages.
- `/account` — identity + cloud only. Moves verbatim from Settings:
  - Account section (signed-in email + note, or "Sign in to sync" CTA when
    logged out, or the unconfigured-build note).
  - Sync status line, Sync now, Log out, Delete account + its ConfirmDialog
    and `/goodbye` redirect flow.
  - No cross-link row back to Settings — the Navbar menu covers both
  directions.
- No other page gains or loses sections. `/goodbye`, `/login`,
  `/auth/callback` unchanged.

## Navigation changes

- **BottomBar** (mobile): the Settings tab keeps pointing at `/settings`.
  No new tab — Account is reached via the Navbar
  menu, not a fifth tab.
- **Navbar account menu**: add an "Account" item above "Settings"
  (About, Account, Settings, Log out). When logged out the menu is replaced
  by the Log in link as today — no change there.
- **Deep links**: nothing external links to `/settings#account` today (the
  Account section has no anchor), so no redirects needed. If an anchor gets
  added later, add a redirect then.

## Component moves

- New route `app/account/page.tsx`: owns the Account section JSX, its state
  (`syncing`, `syncStatus`, `confirmingAccountDelete`), and the
  `syncNowManual` / `deleteAccount` handlers, moved as-is from
  `app/settings/page.tsx`.
- Shared one-liners stay shared: `formatSyncTime` moves to a small helper
  (or lives in `app/lib/sync.ts` next to `getSyncMeta`) so both pages use it
  if Settings ever shows sync state again.
- `SETTINGS_CHANGED_EVENT` listener stays on the Settings page (it guards
  the functional controls); the Account page doesn't render settings values
  (only sync status text), so it needs no listener.
- Auth + sync logic untouched: `AuthProvider`, `sync.ts`, `tombstones.ts`,
  storage/settings seams keep signatures. This is a view-layer move only.

## Edge cases

- **Logged out `/account`**: shows the same CTA state as today ("Sign in to
  sync" or the unconfigured-build note). Never redirects to `/login`
  unprompted — the page must read sensibly as an explanation.
- **Unconfigured builds** (no Supabase keys): `/account` shows the
  local-only note; Sync now / Delete account never render without a user,
  same as today.
- **Delete flow**: confirm dialog → `wipeAccountData` → sign out →
  `/goodbye`. Identical, just hosted on `/account`.
- **Delete-all-local-data** stays in Settings > Data (device concern, not
  identity). Its signed-in notice (tombstones carry the wipe to the cloud)
  stays accurate from either page since it keys off `user`, not route.
- **Login redirects**: `/login` and `/auth/callback` land on `/` (plus
  `?welcome=1` for fresh signups) — unchanged. No post-login landing on
  `/account`; the welcome banner already covers confirmation.

## Test plan

- `npx tsc --noEmit`, `npm run lint`.
- `npm run build` (new `/account` route appears as static).
- Manual: logged-out `/account` (configured + unconfigured copy), logged-in
  sync-now status, full delete-account flow to `/goodbye`, Navbar menu items, 360px pass.
- Unit tests unaffected (no lib changes). Optional: one e2e spec for the
  cross-links + logged-out `/account` CTA.

## Non-goals

- No new account features beyond display name + change password (email
  change, device list, export-cloud-data) — those are future work, and this
  split gives them a home when they arrive.
- No storage-key or sync-protocol changes; localStorage layout identical.
- No BottomBar restructure; no route renames besides the new page.

*Created: 2026-09-13. Context: Phase 4 follow-up — `/settings` currently hosts the Account section added for Supabase sync.*
