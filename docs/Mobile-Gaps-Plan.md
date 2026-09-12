# Mobile Gaps Plan — May Reviewer

Goal: fill missing features and functionality now. Defer all Play Store paperwork.
Stay Next.js web-first, mobile-ready. No native rewrite.

Locked decisions (from scoping):
- Settings: full v1 (study defaults, appearance, notifications, data, Pro slot, about/legal).
- Accounts: Supabase Auth with Email + Google. Sync reviewers + questions + formats + attempts + settings. Files stay local-first in IndexedDB.
- Legal: short plain-English in-app `/privacy` + `/terms`.
- Support: in-app feedback form + public support email.
- Study: search + favorites + missed-only review now. Difficulty tagging deferred.
- Mobile: mobile-only bottom bar, offline read + quiz (generation online-only), local-only reminders, English only (note Tagalog may come later), theme system + toggle, diagnostics none.
- Monetization: free now, reserve `proTier` flag for later. Ads vs paid Pro undecided.
- Data safety: quota warnings + export-all + orphan cleanup.

Current baseline:
- 9 routes in `app/`. Storage is `localStorage` only via `app/lib/storage.ts` plus IndexedDB via `app/lib/attachments.ts`. No auth. `Navbar` account menu has disabled Settings + Log out. `public/` is empty (no manifest, no SW). Single light theme. English only. No analytics or crash reporting. `/about` exists with disclaimer only.

---

## Phase 1 — Settings + shell + theme

New files:
- `app/settings/page.tsx` — sections: Study defaults, Appearance, Notifications, Data, Pro, About and legal.
- `app/lib/settings.ts` — the only file that touches the `mayreviewer-settings` key. Exports `getSettings()`, `updateSettings(patch)`. Defaults plus normalize-on-read, same pattern as `app/lib/storage.ts` normalize.
- `app/components/BottomBar.tsx` — `md:hidden fixed bottom-0` bar with Home, Formats, History, Settings. Active state from `usePathname`, same pattern as `app/components/Navbar.tsx`.

New type:
- `UserSettings = { feedbackMode, defaultCount, shuffle, theme: system|light|dark, fontSize: normal|large, reduceMotion: boolean, remindersEnabled: boolean, reminderTime: string, proTier: free }`

Changes:
- `app/components/Navbar.tsx`: enable the Settings menu item to link to `/settings`. Keep Log out disabled until Phase 4.
- `app/layout.tsx`: render `<BottomBar />`, add `viewport-fit=cover` and `theme-color`, add safe-area bottom padding on `main` so the bar never covers content.
- Theme: follow `prefers-color-scheme` by default, manual override stored in settings and applied as `data-theme` on `html`. Extend `app/globals.css` tokens. Keep existing light tokens as-is.
- Touch pass: 48px minimum targets on quiz radios, tabs, bottom bar items.

Done when:
- Settings persist across reload. Theme toggle works and follows system by default. Bottom bar shows only below 768px with no desktop layout shift.

Verify:
- `npx tsc --noEmit`, `npm run lint`, manual 360px + desktop pass.

---

## Phase 2 — Legal + support

New routes:
- `app/privacy/page.tsx`, `app/terms/page.tsx` — short plain-English copy covering: what lives in the browser (`localStorage` + IndexedDB), what is sent once at generation (text as text, PDFs via temporary Blob storage then deleted), providers (Gemini with Mistral fallback), no training or ads use, clearing browser data deletes local data, AI accuracy disclaimer, support contact email placeholder, last-updated date.
- `app/components/FeedbackForm.tsx` — fields for type + message that open the mail client. No backend. Linked from Settings + About.

Changes:
- `app/about/page.tsx`: trim What's next promises covered by Phase 1 and 4, link to Privacy and Terms, add open-source row (`mammoth`, `fflate`, `idb`) plus version row plus limits row.
- Settings About section links to About, Privacy, Terms.

Done when:
- Direct URL load of `/privacy` and `/terms` works. Copy matches actual behavior. No claims about deletion or sync that do not exist yet.

Verify:
- Content review + link check, `npm run build` for static routes.

---

## Phase 3 — Data safety + offline + study power

Data:
- Storage Used readout via `navigator.storage.estimate()` plus IndexedDB sizes. Quota warning at 80%. Reuse the `QuotaExceededError` copy already in `app/lib/storage.ts`.
- Export-all in Settings: zip of all reviewer JSON files plus a manifest. Attachments stay excluded with an explicit note (same local-only rule as `app/lib/attachments.ts`). Import-all is additive and dedupes by id like the single-reviewer import.
- Orphan cleanup keeps going through `removeReviewerCompletely()` in `app/lib/reviewers.ts` so localStorage deletes, attempt deletes, and IndexedDB deletes stay composed.

Offline:
- Reviewers readable, quizzes takable, `/history` viewable fully offline. Gate Generate and Infer behind an offline banner. Do not queue generation.
- PWA prep only, no store submission: minimal `manifest.webmanifest` plus icons later in Phase 5, service worker caching the app shell and reads, network-first for `/api/*`.

Study:
- Search: home filters by reviewer name, subject, and topic. Questions tab filters by question text. Client-side filter, no new index.
- Favorites: `Question.favorite?: boolean`. Star toggle in Questions tab and quiz results, filter chip, travels inside export JSON, defaults to false on normalize.
- Missed-only: Quiz Setup scope option sourced from the last attempt's wrong + blank ids. Falls back to the full pool when no history exists.
- Reminders local-only: permission prompt in Settings, `reminderTime` checked on app mount with an interval, uses the `Notification` API. No VAPID keys, no backend. Note: iOS only fires for installed PWAs or while the app is open.

Language stays English. Record Tagalog as a possible later addition.

Done when:
- Airplane-mode quiz passes. Export-all round-trip produces no duplicates. Search, favorites, and missed-only persist across reload. Reminder permission never blocks the app.

Verify:
- `npm run test`, `npm run test:e2e`, plus an offline Playwright pass.

---

## Phase 4 — Accounts + Supabase sync

- Supabase Auth with Email + Google. Session replaces the dummy `U` avatar menu in `app/components/Navbar.tsx`. Enable Log out.
- Swap `app/lib/storage.ts` internals to Supabase client calls. Keep function signatures so components stay untouched. Same for settings. Row-level security per user id. Files stay in IndexedDB local-first. No Storage bucket in v1 to avoid cost.
- First sync merges local data to the cloud once, then cloud is the source. `updatedAt` last-write-wins.
- Delete account in Settings plus a web-link placeholder page for the future Play rule. Deletes cloud rows plus local keys.
- Keep `proTier: free`. Gate nothing yet. Add no analytics or crash SDK.

Done when:
- Two-device sync works. Logout and login restores data. Delete wipes cloud plus local. Logged-out local-only mode still works.

Verify:
- Auth end-to-end with a test user, row-level-security negative test, `npm run build`.

---

## Phase 5 — Deferred: Play submission only

Do none of this until Phases 1–4 are done:
- Manifest polish, maskable 512 icon, screenshots, service worker installability.
- Digital AssetLinks + TWA or Capacitor wrapper config, absolute API URL + CORS.
- Shared rate-limit store for `app/lib/rateLimit.ts` (in-memory `Map` multiplies on serverless).
- Opt-in Sentry crash reporting and minimal analytics.
- App bundle + API 36 target + signing, listing assets, content rating, Data Safety form, 12 testers x 14 days closed test, Play Billing when Pro activates.

---

## Test plan per phase

- Phase 1: `npx tsc --noEmit`, `npm run lint`, 360px + desktop manual pass.
- Phase 2: content review, link check, `npm run build`.
- Phase 3: `npm run test`, `npm run test:e2e`, offline Playwright pass.
- Phase 4: auth end-to-end, security negative test, `npm run build`.

*Created: 2026-09-12. Source: scoping answers + repo audit of `app/`, `app/lib/storage.ts`, `app/lib/attachments.ts`, `app/components/Navbar.tsx`, `app/layout.tsx`, `app/about/page.tsx`, `docs/DevPhases-MayReviewer-MVP.md`.*
