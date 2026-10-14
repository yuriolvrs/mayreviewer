# Plan 04: New Reviewer page UX

**Goal:** Make creating a reviewer a single top-to-bottom flow with no scroll-and-return, a sticky Create bar, and a format picker that scales.

**Decisions (confirmed with the user):**
- A past exam added on the page also feeds "Suggest question types" in learn mode.
- The format picker becomes a dropdown plus a clear "Learn from my material" mode, not a long list of cards.

**Problems this fixes:** wrong section order, learn-mode button above its input, dead-end counts placeholder, no sticky action bar, unbounded format list, stale copy, unclear source fields, errors far from cause, import easy to miss.

**Doc links:** `docs/plans/03-learn-from-material.md`, `docs/DECISIONS.md`

## Task 4.1: Reorder and make Create sticky

**Files to touch:** `app/reviewer/new/page.tsx`, `app/components/SourceSections.tsx` (copy only if needed)

**Steps:**
1. New order: Reviewer info, Material (Course material, Project material, Past exam), Exam format, Question count, Topics (optional).
2. Give each source field a one-line "when to use it" description. Mark all three as optional.
3. Replace the bottom Create button with a fixed bar like the one in `app/components/FormatBuilder.tsx`: offset above the mobile bottom nav, shows "N questions" and the current error beside the button.
4. Move the "Import an exported reviewer" entry to a small link under the page title. Keep its behavior.
5. Show the name-required error on blur as well as on submit.
6. Replace the stale "build a format instead" paragraph with accurate copy, or remove it.

**Done when:** The page flows top to bottom with Create always visible. Existing e2e tests that rely on the old order are updated.

## Task 4.2: Format picker and inline learn mode

**Files to touch:** `app/reviewer/new/page.tsx`, `app/components/GeneratedFormatPanel.tsx`, `app/components/OptionSelect.tsx` (reuse only)

**Steps:**
1. Replace the radio cards with two modes: "Use a saved format" (dropdown of formats, with the selected format's type labels shown below it) and "Learn from my material".
2. In learn mode the panel sits directly below the mode switch, after the Material section. The Suggest button reads the three material fields above it, so no scrolling is needed.
3. The panel states which sources it will read (for example "Reading: notes, 1 file").
4. Learn mode also reads the Past exam text and stored `pastexam` attachments. Update `GeneratedFormatPanel` props and the file list sent to `inferFormat`.
5. Counts: in learn mode before inference, show nothing for counts except "Counts appear after you suggest types". After inference show the editable list once, in the panel, and drop the duplicate count control.
6. Keep the id-reuse behavior from plan 03 (one format id, Save to Formats and Create do not duplicate).
7. Show count-total errors next to the count total, not only in the bar.

**Done when:** Manual browser check at 1280px and 375px: add notes, switch to learn mode, press Suggest, edit, Create, with no need to scroll back up. Lint, tsc, and tests pass. Add or update tests where the repo's patterns allow.

**Out of scope:** Changes to generation, the Formats library page, or the format model.
