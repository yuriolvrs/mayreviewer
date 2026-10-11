# Mobile Gaps Plan — May Reviewer

Goal: fill missing features and functionality now. Defer all Play Store paperwork.
Stay Next.js web-first, mobile-ready. No native rewrite.

Status key: `done` = built + verified, `in progress` = partially shipped,
`todo` = not started. Updated 2026-10-11.

Locked decisions (from scoping):
- Settings: full v1 (study defaults, appearance, notifications, data, Pro slot, about/legal).
- Accounts: Supabase Auth with Email + Google. Sync reviewers + questions + formats + attempts + settings. Files stay local-first in IndexedDB.
- Legal: short plain-English in-app `/privacy` + `/terms`.
- Support: in-app feedback form + public support email.
- Study: search + favorites + missed-only review now. Difficulty tagging deferred.
- Study loop (Phase 5): goals, streaks, timed review, weak-type detection, progress, notification copy now; flashcards + spaced repetition after; push delivery stays Phase 6.
- Mobile: mobile-only bottom bar, offline read + quiz (generation online-only), local-only reminders, English only (note Tagalog may come later), theme system + toggle, diagnostics none.
- Monetization: free now, reserve `proTier` flag for later. Ads vs paid Pro undecided.
- Data safety: quota warnings + export-all + orphan cleanup.

Current baseline:
- 9 routes in `app/`. Storage is `localStorage` only via `app/lib/storage.ts` plus IndexedDB via `app/lib/attachments.ts`. No auth. `Navbar` account menu has disabled Settings + Log out. `public/` is empty (no manifest, no SW). Single light theme. English only. No analytics or crash reporting. `/about` exists with disclaimer only.

---

## ✅ Phase 1 — Settings + shell + theme

Status: done (verified: tsc, lint, unit, build, e2e, 360px + desktop pass).

New files:
- ✅ `app/settings/page.tsx` — sections: Study defaults, Appearance, Notifications, Data, Pro, About and legal.
- ✅ `app/lib/settings.ts` — the only file that touches the `mayreviewer-settings` key. Exports `getSettings()`, `updateSettings(patch)`. Defaults plus normalize-on-read, same pattern as `app/lib/storage.ts` normalize.
- ✅ `app/components/BottomBar.tsx` — `md:hidden fixed bottom-0` bar with Home, Formats, History, Settings. Active state from `usePathname`, same pattern as `app/components/Navbar.tsx`.

New type:
- ✅ `UserSettings = { feedbackMode, defaultCount, shuffle, theme: system|light|dark, fontSize: normal|large, reduceMotion: boolean, remindersEnabled: boolean, reminderTime: string, proTier: free }` (`dailyGoal` added later in Phase 5).

Changes:
- ✅ `app/components/Navbar.tsx`: enable the Settings menu item to link to `/settings`. Keep Log out disabled until Phase 4. (Log out enabled + Account item added in Phase 4.)
- ✅ `app/layout.tsx`: render `<BottomBar />`, add `viewport-fit=cover` and `theme-color`, add safe-area bottom padding on `main` so the bar never covers content.
- ✅ Theme: follow `prefers-color-scheme` by default, manual override stored in settings and applied as `data-theme` on `html`. Extend `app/globals.css` tokens. Keep existing light tokens as-is. (Pre-paint flash script added later.)
- ✅ Touch pass: 48px minimum targets on quiz radios, tabs, bottom bar items.

Done when:
- Settings persist across reload. Theme toggle works and follows system by default. Bottom bar shows only below 768px with no desktop layout shift.

Verify:
- `npx tsc --noEmit`, `npm run lint`, manual 360px + desktop pass.

---

## ✅ Phase 2 — Legal + support

Status: done (verified: content review, link check, build).

New routes:
- ✅ `app/privacy/page.tsx`, `app/terms/page.tsx` — short plain-English copy covering: what lives in the browser (`localStorage` + IndexedDB), what is sent once at generation (text as text, PDFs via temporary Blob storage then deleted), providers (Gemini with Mistral fallback), no training or ads use, clearing browser data deletes local data, AI accuracy disclaimer, support contact email placeholder, last-updated date.
- ✅ `app/components/FeedbackForm.tsx` — fields for type + message that open the mail client. No backend. Linked from Settings + About.

Changes:
- ✅ `app/about/page.tsx`: trim What's next promises covered by Phase 1 and 4, link to Privacy and Terms, add open-source row (`mammoth`, `fflate`, `idb`) plus version row plus limits row.
- ✅ Settings About section links to About, Privacy, Terms. (Account split moved identity rows to `/account`; legal links remain in footer + About.)

Done when:
- Direct URL load of `/privacy` and `/terms` works. Copy matches actual behavior. No claims about deletion or sync that do not exist yet.

Verify:
- Content review + link check, `npm run build` for static routes.

---

## ✅ Phase 3 — Data safety + offline + study power

Status: done (verified: unit, e2e, offline Playwright pass, airplane-mode quiz).

Data:
- ✅ Storage Used readout via `navigator.storage.estimate()` plus IndexedDB sizes. Quota warning at 80%. Reuse the `QuotaExceededError` copy already in `app/lib/storage.ts`.
- ✅ Export-all in Settings: zip of all reviewer JSON files plus a manifest. Attachments stay excluded with an explicit note (same local-only rule as `app/lib/attachments.ts`). Import-all is additive and dedupes by id like the single-reviewer import.
- ✅ Orphan cleanup keeps going through `removeReviewerCompletely()` in `app/lib/reviewers.ts` so localStorage deletes, attempt deletes, and IndexedDB deletes stay composed.

Offline:
- ✅ Reviewers readable, quizzes takable, `/history` viewable fully offline. Gate Generate and Infer behind an offline banner. Do not queue generation.
- ✅ PWA prep only, no store submission: service worker caching the app shell and reads, `/api/*` never cached. Correction 2026-10-11: the manifest was marked done here but never existed. It landed in the 2026-10-11 audit (`app/manifest.ts`, PNG + maskable icons, Apple icon) — see below.

Study:
- ✅ Search: home filters by reviewer name, subject, and topic. Questions tab filters by question text. Client-side filter, no new index.
- ✅ Favorites: `Question.favorite?: boolean`. Star toggle in Questions tab and quiz results, filter chip, travels inside export JSON, defaults to false on normalize.
- ✅ Missed-only: Quiz Setup scope option sourced from the last attempt's wrong + blank ids. Falls back to the full pool when no history exists.
- ✅ Reminders local-only: permission prompt in Settings, `reminderTime` checked on app mount with an interval, uses the `Notification` API. No VAPID keys, no backend. Note: iOS only fires for installed PWAs or while the app is open.

Language stays English. Record Tagalog as a possible later addition.

Done when:
- Airplane-mode quiz passes. Export-all round-trip produces no duplicates. Search, favorites, and missed-only persist across reload. Reminder permission never blocks the app.

Verify:
- `npm run test`, `npm run test:e2e`, plus an offline Playwright pass.

---

## ✅ Phase 4 — Accounts + Supabase sync

Status: done (verified live: two-device sync, RLS negative test with two
users, delete-account wipe, logout flush-and-clear + login restore).

Built on top of the plan (all committed): `/account` route split out of
Settings (email, display name, sync, change password, log out, delete);
logout empties the device after a successful cloud flush (offline keeps
local rows with a notice); account-switch guard clears the previous
owner's leftovers before merging.

- ✅ Supabase Auth with Email + Google. Session replaces the dummy `U` avatar menu in `app/components/Navbar.tsx`. Enable Log out.
- ✅ Swap `app/lib/storage.ts` internals to Supabase client calls. Keep function signatures so components stay untouched. Same for settings. Row-level security per user id. Files stay in IndexedDB local-first. No Storage bucket in v1 to avoid cost. (Built as local-first + background sync instead of cloud-direct reads: signatures stayed sync, offline and logged-out mode kept working.)
- ✅ First sync merges local data to the cloud once, then cloud is the source. `updatedAt` last-write-wins.
- ✅ Delete account in Settings plus a web-link placeholder page for the future Play rule. Deletes cloud rows plus local keys. (Lives on `/account` after the split; `/goodbye` is the placeholder page.)
- ✅ Keep `proTier: free`. Gate nothing yet. Add no analytics or crash SDK.

Done when:
- Two-device sync works. Logout and login restores data. Delete wipes cloud plus local. Logged-out local-only mode still works.

Verify:
- Auth end-to-end with a test user, row-level-security negative test, `npm run build`.

---

## Phase 5 — Study loop (goals, streaks, timed review, progress)

Status: in progress — item 1 done (dailyGoal + streak engine + home strip,
274 unit, phase5.spec e2e, build green); items 2–4 todo; flashcards/SRS
deferred by decision.

Rationale: all of this is app logic + data model, not mobile work. Building it
now ships to web immediately and rides the Phase 6 wrapper unchanged. Nothing
here may depend on native APIs (push delivery, background fetch, widgets all
stay Phase 6). Everything stays local-first and sync-compatible: new fields
ride inside the existing JSONB rows, no schema migration.

Order within the phase (each shippable alone):

1. **Daily loop: goals + streaks + restores + milestones. ✅** `dailyGoal` in settings; today's
   answered-count derived from attempts' `takenAt`; home shows goal progress.
   Streak = consecutive calendar days (device timezone) with **≥5 answered
   questions** (any reviewer, any type; split attempts on one day sum).
   Decided 2026-09-18, revised 2026-09-20; tests encode this.
   Restores: the free grant tops the bank up to 3 every calendar month (1
   banked → 2 free; 5 banked → none; milestone earnings can bank above, cap
   6), each repairing one missed day — spendable only the day after the miss (manual tap; sleep through the
   next day and the streak is lost).    Bonus restores from milestones: 7-day
   (+1), 30-day (+2), 100 questions (+1), 500 questions (+2), first perfect
   (+1), first timed (+1) — since replaced by leveled badge families (one tile
   per family, every level-up banks +1): Hot Streak 7→500, Riddler 100→1000,
   The Cleaner 1→100, goal crusher 1→60, speedster/marathon/owl/bird,
   explorer 3→10 (timed family removed by decision). Attempts record `parSec` (estimate at quiz start, resume-safe)
   for Speedster's half-estimate check; per-level claims migrate the old
   one-claim ids. Streak state rides inside the settings row (sync,
   no migration); attempts record `timeLimitSec` so timed quizzes are
   detectable. Progress page built desktop-first: `/progress` route (goal, week dots, at-risk restore naming the
   rescued length, banked line, claimable-first milestones) + top-Navbar link; home strip pairs the goal with the
   global streak plus an inline Restore row when yesterday was missed. Mobile bottom-bar tab ✅ (2026-10-11).
2. **Timer mechanic, two surfaces. ✅** Countdown timer in the quiz flow;
   record `durationSec` on the attempt (normalize default for old attempts,
   sync passes it through untouched). "5-minute review" mode is a preset on
   top: question count sized to ~5 min with the timer on.
3. **Aggregates: weak areas + progress. (todo)** Per question-*type* accuracy from
   attempts (type + correctness already stored) — framed honestly as
   weak-type/weak-set, not weak-topic. True per-topic needs a tagging feature
   first. Progress = accuracy trend + per-reviewer stats, numbers and simple
   bars, no chart lib.
4. **Notification content engine. (todo)** Computes the copy locally (questions due,
   streak at risk, e.g. "10 questions on Calculus ready"). Delivery stays
   local-only like current reminders (fires while open/installed); plugs
   into Phase 6 push unchanged.

Deferred inside this phase until Tier 1 lands:
- **Flashcards (basic) (todo, deferred by decision)** — flip UI over existing questions; AI-generated
  dedicated cards later.
- **Spaced repetition (todo, deferred by decision)** — SRS fields per question (`interval`, `due`) +
  simplified SM-2 scheduler (pure, very testable) + due queue.

Done when:
- Goal progress, streak, timer, weak-type, and trend all render from real
  attempt data. Logged-out mode computes everything locally. Nothing new
  breaks offline quiz or two-device sync.

Verify:
- `npm run test` (streak/scheduler/aggregates are pure-function unit tests),
  `npm run test:e2e` (goal + timed flows, plus `e2e/mobile.spec.ts`: every
  route at 360px in normal and large text), `npm run build`.

---

## ✅ 2026-10-11 audit — mobile fixes

Status: done (verified: tsc, lint, 313 unit, 74 e2e incl. new
`e2e/mobile.spec.ts`, `npm run build`).

- ✅ Footer links sat under the fixed bottom bar on phones: the bar padding was on `main`, but the footer comes after `main`. Padding moved to `body` and includes the safe-area inset.
- ✅ Bottom bar: tabs with icons. Below md the top Navbar drops its duplicate text links and keeps only the logo + account menu (one header row instead of two). Revised 2026-10-12 to 4 tabs (Reviewers, Progress, History, Settings); Formats moved to a row in Settings (setup, not the daily loop).
- ✅ Web app manifest (`app/manifest.ts`), 192/512 icons, maskable 512, Apple touch icon, `appleWebApp` metadata. The app is now installable.
- ✅ Reminders never fired on Android: Chrome there throws on `new Notification()`. Reminders now show through the service worker registration, and `sw.js` handles the tap (focus or open the app).
- ✅ "Large text" did almost nothing: 434 text sizes were fixed px, so the root-size bump skipped them. All converted to the same size in rem.
- ✅ iOS zoomed into any focused field under 16px. Phone-width fields are now 16px minimum.
- ✅ Theme-color (browser / status bar) now follows the manual theme override, not just the OS.
- ✅ Quiz on phones: the answered count + countdown is pinned to the top. Before, it scrolled away after question 1.
- ✅ Details tab: debounced source edits flush when the page is hidden. Phones kill background pages without unmounting them.
- ✅ Sync: the 60s full pull pauses while the app is hidden (data + battery).
- ✅ Sync: cloud pulls page past Supabase's 1000-row cap. Before, rows past the cap looked "deleted on another device" and were dropped locally (attempts hit this first).

## Web hardening — do before Phase 6 (todo)

These affect the live web app now, not only the Play build.
- [in progress] Shared rate-limit store: code done (`createSharedRateLimiter` in `app/lib/rateLimit.ts`, Upstash Redis fixed window, in-memory fallback when unconfigured or slow). Live once an Upstash for Redis store is connected to the Vercel project (`KV_REST_API_URL` / `KV_REST_API_TOKEN`).
- [todo] Incremental sync: every run pulls every row's full JSON. Pull ids for delete detection, but full rows only where `updated_at` > watermark. Matters most on mobile data.
- [todo] Service worker: offline load of an uncached `/reviewer/<id>` falls back to the cached home HTML, so the wrong page renders. Also, old hashed `/_next/static` files are never pruned from the cache.
- [todo] `/api/generate` and `/api/infer-format` accept anonymous calls. Decided 2026-10-12: Cloudflare Turnstile (free, mostly invisible) after the landing ships; keeps no-account use. Needs a site key + secret key.
- [x] Landing page on `/` for first-time visitors (2026-10-12). `EntryScript` picks before first paint: saved reviewers, a Supabase session, or a prior app entry show the reviewers home; everyone else sees the landing. `/` stays static. Product record in `PRODUCT.md`; direction contract in `.impeccable/surfaces/`.

---

## Phase 6 — Deferred: Play submission only

Status: todo.

Do none of this until Phases 1–5 are done:
- [x] Manifest, maskable 512 icon, service worker installability (2026-10-11 audit).
- [todo] Store screenshots (phone 360–412px, from `e2e/mobile.spec.ts` shots as a start).
- [todo] TWA wrapper (decision below) + Digital Asset Links.
- [todo] Opt-in Sentry crash reporting and minimal analytics.
- [todo] App bundle + API 36 target + signing, listing assets, content rating, Data Safety form, 12 testers x 14 days closed test, Play Billing when Pro activates.

### How the web app becomes the Android app

Decision (recommended): Trusted Web Activity (TWA), not Capacitor.

A TWA is a small Android app with no UI of its own. It opens the deployed
site full-screen in the phone's Chrome, with no address bar. So:
- The app is the live site. A web deploy updates every installed app at
  once. A new `.aab` is needed only for icon, name, or package changes.
- Same origin as the site: API routes, Supabase auth, and Google sign-in
  work unchanged. No CORS, no absolute API URL.
- Storage is Chrome's storage for the origin. Local-first data,
  IndexedDB files, the service worker, and offline quiz all carry over.
- Notifications go through Android's notification permission (Android 13+);
  Bubblewrap adds the delegation.

Why not Capacitor: it needs a static export bundled into the app, and this
app has server routes (`/api/*`) and dynamic pages. Pointing Capacitor at the
live URL makes it a plain WebView instead. Google blocks OAuth sign-in inside
WebViews, so Google login would need a native plugin. Capacitor becomes worth
it only for native-only features (true background push, widgets).

Steps:
1. Deploy to a stable HTTPS domain (the TWA is tied to it).
2. `npx @bubblewrap/cli init --manifest https://<domain>/manifest.webmanifest` — generates the Android project from the manifest (name, icons, colors, start URL).
3. `bubblewrap build` — produces a signed `.aab`.
4. Serve `/.well-known/assetlinks.json` with the package name + the Play App Signing SHA-256 fingerprint (from Play Console). Without it, Android shows a browser bar at the top.
5. Play Console: listing, Data Safety form, privacy URL (`/privacy`), account-deletion URL (`/goodbye`), content rating, closed test (12 testers x 14 days), then production.

iOS: no TWA equivalent, and Apple rejects plain website wrappers. The iOS
path is "Add to Home Screen" (manifest + `appleWebApp` are in place);
reminders there fire only from the installed web app.

---

## Test plan per phase

- Phase 1: `npx tsc --noEmit`, `npm run lint`, 360px + desktop manual pass.
- Phase 2: content review, link check, `npm run build`.
- Phase 3: `npm run test`, `npm run test:e2e`, offline Playwright pass.
- Phase 4: auth end-to-end, security negative test, `npm run build`.
- Phase 5: unit tests for streak/scheduler/aggregates, goal + timed e2e flows, `e2e/mobile.spec.ts`, `npm run build`.
- Phase 6: Lighthouse installability pass on the deployed URL, `assetlinks.json` check (no browser bar in the TWA), reminder + Google sign-in on a real Android device.

*Created: 2026-09-12. Source: scoping answers + repo audit of `app/`, `app/lib/storage.ts`, `app/lib/attachments.ts`, `app/components/Navbar.tsx`, `app/layout.tsx`, `app/about/page.tsx`, `docs/DevPhases-MayReviewer-MVP.md`.*
