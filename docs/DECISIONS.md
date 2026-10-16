# Decisions

Format: each entry has **Context**, **Decision**, **Reason**, **Status** (Accepted/Proposed).

## 2026-10-16: Progress loop overhaul

**Context:** An audit found the reward layer invisible. Quiz results never mention goal, streak or badges. Claims are manual and can dead-end at "Bank full". A blanks-only 50-question submit fills the goal and the streak day.
**Decision:** (1) A streak day, the goal and Riddler count questions answered (`answers` entries plus non-empty typed text), not served. Attempts with no `answers` field fall back to `total`. (2) `MIN_DAILY_GOAL` rises to 5, the streak bar. A stored goal of 1-4 clamps up on read. (3) Levels bank automatically. A level reached at a full bank waits as `pending` and settles when a restore is spent. This supersedes the manual claim and the "No claims at the restore cap" entry. (4) Milestone families shrink to five: Relentless, Riddler, Flawless, Goal Getter, Explorer. Speedster, Enduring, Night Owl and Early Bird are removed. Flawless needs 5 or more questions. (5) The badge hue exception ends. The Progress page uses accent and neutrals only.
**Reason:** Blank submits must not earn rewards. One daily number must not disagree with the streak bar. A reward should arrive, not be collected. Removed families rewarded when, not what, the user studied. Levels already banked stay banked.
**Status:** Accepted

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

## 2026-10-14: Built-in OS format renamed

**Context:** The first built-in format used a school course code in its name and id. The user wants no mention of the course code in the app.
**Decision:** The format is now "Operating Systems Exam" with id `os-exam`. One legacy id constant (`LEGACY_OS_EXAM_ID`) stays. Saved reviewers, attempts, and old export files with that id read back as `os-exam`, and attempts also take the new name. Old `/formats/<legacy id>` links are not redirected.
**Reason:** Saved data and old export files keep working. An old export file is never saved as a custom copy of the built-in.
**Status:** Accepted

## 2026-10-14: Sharing reviewers and formats

**Context:** The only way to share was a file export. Users want in-app sharing.
**Decision:**
- A share is a questions-only snapshot. Notes, files, past exams, and quiz history are never shared. A custom format may travel with a reviewer, without its past exam.
- Each share has a 6-character code and the link `/s/CODE`. It is unlisted by default. The owner can tick "List publicly" to show it on `/browse`.
- One share per item. "Update share" replaces the snapshot under the same code. Copies already in a library do not change.
- Only signed-in users share. Anyone can open a share and add a copy to their local library.
- Signed-in users have a `Name#tag` display name. The name is free-form. The pair is unique, compared case-insensitively. Each share chooses whether to show it.
- Public reads go through the `get_share` and `list_gallery` functions. The `shares` table has owner-only RLS.
- Moderation: a Report button writes to `share_reports`. The operator removes shares by hand.
- Owners see an anonymous add count ("Added N times"). Views and quiz counts are not tracked. No viewer identity is stored.
**Reason:** Questions-only keeps copyright and privacy exposure small and needs no file storage. Files can be added later as an opt-in.
**Status:** Accepted

## 2026-10-15: Shared BackLink component

**Context:** Users could not tell how to go back. Some pages had a small breadcrumb, some a plain text link, and many had nothing.
**Decision:**
- One `BackLink` component (bordered button with a left arrow) replaces the breadcrumbs and the ad-hoc back links.
- It goes to a fixed parent page. It does not call `history.back()`.
- Landing, history, progress, the formats list, goodbye, the quiz "taking" stage, and auth callback have no back link.
**Reason:** A fixed parent works for deep links and refreshes. History-based back does not.
**Status:** Accepted
