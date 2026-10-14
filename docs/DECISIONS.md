# Decisions

Format: each entry has **Context**, **Decision**, **Reason**, **Status** (Accepted/Proposed).

## 2026-10-13: Badge claims stay allowed while signed out

**Context:** The Progress page lets a signed-out user claim badge levels.
**Decision:** Keep it. No auth gate on claims.
**Reason:** The app is local-first, and signed-out use is a supported mode. A claim only adds restores to the user's own streak, so there is nothing to protect.
**Status:** Accepted

## 2026-10-13: Streak state merges on sync; other settings stay last-write-wins

**Context:** Whole-object last-write-wins on settings dropped spent restores and claimed levels from the losing side. Lost levels then became claimable again.
**Decision:** `mergeStreakState` unions restored days, takes the per-family max of claimed levels, and sets the bank to the winner's bank plus loser-only claims minus loser-only spends (clamped 0..6). The monthly top-up persists without changing the settings stamp.
**Reason:** No user progress is lost, and no award is paid twice. Keeping the stamp stops default settings after logout from beating the cloud row on login.
**Status:** Accepted

## 2026-10-13: Goal Getter uses the goal of that day

**Context:** Goal days were measured against the current goal, so lowering the goal unlocked levels retroactively.
**Decision:** Each attempt stores `dailyGoal`. A day's goal is the highest stamped goal among its attempts. Legacy attempts count as `max(current goal, 10)`.
**Reason:** Closes the loophole. The floor of 10 means legacy days cannot be reopened by a lower goal. Users who had a goal below 10 may see fewer legacy goal days, but levels they already claimed stay claimed.
**Status:** Accepted

## 2026-10-13: No claims at the restore cap

**Context:** A claim at 6 banked restores used up the level and gave nothing.
**Decision:** `claimBadgeLevel` refuses at the cap. The tile shows a disabled "Bank full" button, and the level stays claimable until a restore is spent.
**Reason:** A reward is never silently lost.
**Status:** Accepted

## 2026-10-14: UI overhaul (plan 02)

**Context:** The critique scored Formats, History, and the reviewer edit page 21/40. It found a P0 on mobile: the Details Save bar sat under the bottom nav.
**Decision:**
- Restrained exam-paper look: numbered items, lettered options, a directions line, and a mono score line, used only in format previews, the Questions list, and History scores.
- Unsaved edits are guarded with `beforeunload` plus a capture-phase link-click confirm. The installed Next App Router has no navigation-blocking API.
- Generate can keep starred (`favorite`) and hand-written (`source: "manual"`) questions.
- In the three-choice confirm dialog, Cancel gets initial focus.
- Clone opens an unsaved draft. Past-exam files are copied on save.
- The Progress badge colors stay as a deliberate exception to the one-accent rule.
**Reason:** These fix the critique's priority issues without restyling surfaces that already work.
**Status:** Accepted
