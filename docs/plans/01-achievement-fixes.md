# Plan 01: Achievement and streak-state fixes

**Goal:** Stop sync from losing streak progress, close the Goal Getter
loophole, and make the claim button honest at the restore cap.

**Docs:** `app/lib/streaks.ts` header comments, `app/lib/sync.ts` (`pickSettings`,
`runSync`), `docs/Mobile-Gaps-Plan.md` (local-first + background sync),
`docs/DECISIONS.md`.

Signed-out claiming stays allowed. The app is local-first, and badge rewards
only affect the user's own streak.

## Tasks

- [x] 01.1 Merge streak state on sync; stop the monthly grant from bumping the settings stamp
- [x] 01.2 Goal Getter measures each day against the goal of that day
- [x] 01.3 Claim at the restore cap; streak-minimum copy

---

# Task 01.1: Merge streak state on sync

**Goal:** A sync never drops a spent restore or a claimed level, and never
makes a claimed level claimable again.

**Files to touch:** `app/lib/streaks.ts`, `app/lib/sync.ts`, `app/lib/settings.ts`,
`tests/streaks.test.ts`, `tests/sync.test.ts`

**Problem:** Streak state lives inside settings. Sync settles settings with
whole-object last-write-wins (`pickSettings`). The losing side's
`restoredDays` and `claimedLevels` vanish. Attempts merge row by row, so the
lost levels show "Claim +1" again and bank extra restores.

Second cause: `getStreakState()` writes the monthly top-up through
`updateSettings`, which stamps "now". After logout (settings reset to
defaults, stamp null), opening the home page stamps the default settings as
newest. The next login then picks the local defaults over the cloud row.

**Steps:**
1. In `streaks.ts`, add a pure `mergeStreakState(winner: StreakState, loser: StreakState): StreakState`:
   - `restoredDays`: union (deduped, same 366 cap as normalize).
   - `claimedLevels`: per-family max.
   - `banked`: `winner.banked`
     `+ Σ max(0, loser.claimed[f] − winner.claimed[f])` (claims only the loser made)
     `− count(loser.restoredDays not in winner.restoredDays)` (spends only the loser made),
     clamped to `[0, RESTORES_CAP]`.
   - `grantedMonth`: the winner's. `ensureMonthlyGrant` re-applies on read and is idempotent.
2. In `runSync`, after `pickSettings`, build the final settings as the
   picked set with `streak: mergeStreakState(picked.streak, other.streak)`
   (other = the side that lost; when there is no cloud row, no merge).
   Write it locally with `replaceSettings` whenever it differs from the local
   settings, even if the local side won. Keep the picked `updatedAt`. Push
   the merged set to the cloud.
3. In `settings.ts`, `getStreakState()` must persist the top-up without
   changing the settings updated-at stamp. Use `replaceSettings(next,
   getSettingsUpdatedAt())`. Its event re-triggers `getStreakState` on
   listening pages; that is a no-op the second time.
4. Tests: unit-test `mergeStreakState` (loser-only claim, loser-only spend,
   both claimed the same level, both restored the same day, clamp at 0 and
   cap). In `sync.test.ts`, cover: cloud newer + local has an extra claim and
   restore, so both survive in local storage and in the pushed row. Cover the
   stamp: after `clearLocalSyncedData` and a `getStreakState()` call, the
   settings stamp is still null.

**Done when:** `npm run test`, `npx tsc --noEmit`, `npm run lint` pass.

**Out of scope:** non-streak settings stay last-write-wins.

---

# Task 01.2: Goal Getter uses the goal of that day

**Goal:** Lowering the daily goal no longer unlocks Goal Getter levels
for past days.

**Files to touch:** `app/types/index.ts`, `app/lib/storage.ts`,
`app/lib/streaks.ts`, `app/progress/page.tsx`, `tests/streaks.test.ts`
(and `app/reviewer/[id]/quiz/page.tsx` only if `saveQuizAttempt` cannot read
settings itself)

**Steps:**
1. Add optional `dailyGoal?: number` to `QuizAttempt`, with a comment in the
   style of the fields around it. `saveQuizAttempt` stamps
   `getSettings().dailyGoal`. `normalizeAttempt` does not backfill it
   (absence means "unknown").
2. `familyValue("goals")`: a day counts when its total reaches that day's
   goal. That day's goal = the max `dailyGoal` among the day's attempts.
   An attempt without `dailyGoal` contributes `max(opts.goal, DEFAULT_DAILY_GOAL)`,
   so a lowered goal cannot reopen legacy days.
   Add `dailyGoal?: number` to `BadgeAttempt`. Update the comment above the
   badge families ("goal days measure against the current goal setting").
3. Tests: a lowered current goal does not raise the count for stamped days;
   a legacy day uses the floor; a mixed day uses the max.

**Done when:** tests, tsc, lint pass.

**Out of scope:** today's goal bar and "Goal met" keep using the current goal.

---

# Task 01.3: Claim at the cap; copy constant

**Goal:** A claim never silently gives nothing.

**Files to touch:** `app/lib/streaks.ts`, `app/progress/page.tsx`,
`tests/streaks.test.ts`, `e2e/progress.spec.ts`

**Steps:**
1. `claimBadgeLevel` returns null when `state.banked >= RESTORES_CAP`. The
   level stays unclaimed, so it can be claimed after a restore is spent.
   Update the test that expects a claim at 6 to keep the level.
2. Progress page: when a level is claimable and the bank is full, render the
   button disabled with the text "Bank full" and an aria-label that says the
   restore bank is full. Same size and place as "Claim +1".
3. Replace the hard-coded "5" in the streak copy (the "No streak yet" line
   and the "keep it going" lines) with `STREAK_DAY_MIN_QUESTIONS`.
4. Add an e2e case to `progress.spec.ts`: bank at 6 with a claimable level
   shows a disabled "Bank full" button.

**Done when:** `npm run test`, `npx tsc --noEmit`, `npm run lint`, and
`npx playwright test e2e/progress.spec.ts` pass.

**Out of scope:** badge thresholds, layout of the tiles.
