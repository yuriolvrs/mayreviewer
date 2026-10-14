# Plan 02: UI/UX overhaul (Formats, History, Reviewer edit, site-wide)

**Goal:** Fix the broken and risky flows found in the 2026-10-14 critique (21/40),
then restructure Formats, History, and the reviewer edit page. Carry the
DESIGN.md exam-paper grammar into the places where it helps a student.

**Read first (every task):**
- `DESIGN.md` (tokens, One Pencil Rule, Labeled Status Rule, Rem Rule, 44px targets, 16px mobile fields)
- `PRODUCT.md` (principles: format is the product, student stays in control, phone first)
- `C:\Users\yuri\.claude\skills\impeccable\reference\craft-floor.md` (quality floor and bans for UI edits)
- `CLAUDE.md` (surgical changes, check `node_modules/next/dist/docs/` before Next-specific APIs)

**Visual direction (decided):** a restrained exam-paper look. Use numbered
items, lettered options, a directions line, and a mono score line where they
carry meaning (format sample questions, the Questions list, the History score).
Do not restyle surfaces that work. No new hues, no shadows on cards, accent
only for actions, selection, and focus.

**Rules for all tasks:**
- Status color always has a word next to it.
- Touch targets ≥ 44px tall on mobile for every action you touch (use padding
  or a larger hit area; the visual can stay compact).
- Disabled reasons go in visible helper text, not only in `title`.
- Keep existing tests green. Update e2e specs whose copy or selectors you change.
- Do not commit, stage, or edit `docs/plans` / `docs/DECISIONS.md`.

## Tasks

- [x] 02.1 Unsaved-changes guard + Details tab fixes (P0)
- [x] 02.2 History overhaul + shared attempt row
- [x] 02.3 Questions tab: generate summary, safer overwrite, calmer toolbar
- [x] 02.4 Format builder: sticky bar, collapsible types, plain labels, errors at the field
- [x] 02.5 Formats list, read-only format view, sample question
- [x] 02.6 Reviewer page shell, new-reviewer page, OptionSelect accessibility
- [x] 02.7 Site-wide: loading skeletons, auth placeholder, copy consistency

Order: 02.1, 02.2, 02.3 in parallel. Then 02.4 → 02.5 (same implementer) in
parallel with 02.6. Then 02.7.

---

# Task 02.1: Unsaved-changes guard + Details tab fixes

**Goal:** Edits on the Details tab can always be saved on a phone, and are
never lost silently.

**Files to touch:** new `app/lib/useUnsavedGuard.ts`, `app/components/DetailsTab.tsx`,
a unit or e2e test.

**Steps:**
1. `useUnsavedGuard(dirty: boolean, message?: string)`: while `dirty`, add a
   `beforeunload` handler, and a capture-phase click listener on same-origin
   `<a>` links that asks `window.confirm(message)` and cancels the click when
   declined. Remove both when clean or unmounted. Read the Next.js docs in
   `node_modules/next/dist/docs/` first; if the installed Next exposes a
   supported navigation-blocking API, use it instead and say so.
2. DetailsTab sticky bar (`DetailsTab.tsx` ~line 421, `fixed inset-x-0 bottom-0 z-40`):
   below `md`, sit above the bottom bar: `bottom-[calc(4rem+env(safe-area-inset-bottom))]`,
   `md:bottom-0`. Check `BottomBar.tsx` for its real height and z-index and
   match them. Verify that `elementFromPoint` at the Save button's center hits
   the button at 375×812.
3. Use `useUnsavedGuard(dirty)` in DetailsTab.
4. Switching the exam format re-seeds per-type counts silently
   (~lines 196-205). When the current counts differ from the old format's
   defaults, confirm with the existing `ConfirmDialog` ("Switching formats
   resets your question counts to the new format's defaults.") before switching.

**Done when:** the Save button is tappable at 375×812, leaving with unsaved
edits asks first, the format switch confirms when needed; `npm run test`,
`npx tsc --noEmit`, `npm run lint`, and the e2e specs touching Details pass.

**Out of scope:** unifying the three save models beyond the confirm above.

---

# Task 02.2: History overhaul + shared attempt row

**Goal:** One attempt row used in both History and the per-reviewer attempts
list, with honest scores and a readable trend.

**Files to touch:** `app/history/page.tsx`, `app/components/QuizAttempts.tsx`,
new `app/components/AttemptRow.tsx`, `app/lib/questions.ts` (score helpers
only), tests.

**Steps:**
1. Extract `AttemptRow` from QuizAttempts (it already has delta and the
   regenerate-aware "New questions" divider logic). Use it in both places.
   Fix the `-mx-2` alignment so openable and non-openable rows line up.
2. `total === 0` (legacy attempts): show "No score recorded" in tertiary text
   and a visible reason ("Answers weren't saved for this attempt"). Never NaN.
   Guard `scoreTone` and any percent math.
3. Score display in exam-paper grammar: mono `5 / 6` plus percent, with a
   word next to the color ("Passing" ≥ 80, "Review" 50–79, "Retake" < 50).
   Do not use the warning yellow for scores (DESIGN.md reserves it for
   "marked unsure"); use text color + word instead of a status hue for the
   middle band.
4. Delta copy: "↑ 33 pts" (percentage points), not "↑ 33%".
5. Group headings: Ink, not accent; underline on hover. Each group shows
   latest and best score.
6. Filter chips: one horizontally scrolling row with 44px-tall chips on
   mobile (no wrapping wall). Keep the "All reviewers" chip first.
7. Fix the subtitle casing ("reviewers").

**Done when:** no NaN anywhere with legacy attempts; History and the
per-reviewer list render the same row; tests, tsc, lint, and
`e2e/phase5.spec.ts` + any history-related specs pass.

**Out of scope:** charts or sparklines.

---

# Task 02.3: Questions tab

**Goal:** Generate shows what it will do and never destroys curated work by
surprise. The list is studyable on a phone.

**Files to touch:** `app/components/QuestionsTab.tsx` (and
`app/components/GenerationModal.tsx` only if generation options live there).

**Steps:**
1. Generate summary card above the list: "Will generate 8: 3 Timeline,
   2 Code, … from Course material · Edit details" (link to `?tab=details`).
   Use the reviewer's saved counts and sources.
2. When questions exist, Generate is a secondary button; Take Quiz stays the
   only accent action on the page.
3. Overwrite dialog (~line 1177): offer "Keep starred and hand-written"
   (keeps `starred` and `source === "manual"` questions, generates the rest)
   and "Replace all". The copy states plainly what each removes.
4. Toolbar: on mobile, collapse type chips, Starred, Source, and Sort into
   one "Filter (n)" disclosure or sheet; search and select-all stay visible.
   The first question must be visible in the first mobile screen with the
   seeded reviewer.
5. Per-question Edit/Delete: 44px hit areas (or an overflow menu).
6. "Hide answers" toggle, off by default, so the list can be used for study.
7. Number each question in mono (`1.`, `2.`) and add the word "Correct"
   beside the correct option's check.
8. Fixes from the detector: the `shrink-0` label at ~line 1016 must wrap
   (no 8px overflow at 375px); "N questions total" and the option letter on
   the green correct row must reach 4.5:1 in both themes (use
   `text-text-secondary` or the success ink).

**Done when:** no horizontal overflow at 375px on `?tab=questions`; tests,
tsc, lint, and `e2e/questionRendering.spec.ts`, `e2e/phase3.spec.ts` pass.

**Out of scope:** changing the generation API or prompts.

---

# Task 02.4: Format builder

**Goal:** Building a format on a phone is safe and short.

**Files to touch:** `app/components/FormatBuilder.tsx`, `app/formats/new/page.tsx`,
`app/formats/[id]/page.tsx` (edit path only).

**Steps:**
1. Sticky Discard / Save bar, same pattern and mobile offset as the fixed
   DetailsTab bar from 02.1. Add `useUnsavedGuard(dirty)` (from
   `app/lib/useUnsavedGuard.ts`).
2. Each type card collapses to a one-line summary (label · answer format ·
   layout/material · default count) and expands to edit. New and invalid
   types open expanded.
3. Validation: mark the failing card (error border + message inside it, with
   `aria-invalid` and `aria-describedby` on the field), expand it, and scroll
   to it. Keep a short summary near Save.
4. "Learn from a past exam": on a new format it stays as the first-step CTA.
   In edit mode, move it behind a "Re-infer from a past exam" disclosure
   below the types.
5. Plain labels: "Guidance (plain words, compiled into the prompt)" →
   "Tips for the question writer (optional)"; "Infer question types" →
   "Read the exam and suggest types"; keep the meaning of Layout and Material
   but add a one-line hint under each.
6. Removing a type: show an inline "Type removed · Undo" row in its place for
   the session instead of deleting instantly with no way back.
7. Past-exam files stored under an unsaved new format id: delete them when
   the user discards or leaves a new format unsaved (use the existing
   attachments helpers).
8. Dropzone copy: "Drop files here or tap to choose" on touch devices
   (`(pointer: coarse)`), "click to browse" otherwise.
9. After Save, land on `/formats` with a visible "Format saved" status line
   (query param or sessionStorage flag, read once, `role="status"`).

**Done when:** tests, tsc, lint, and any format e2e specs pass; the builder
at 375px has Save always reachable.

**Out of scope:** the inference API.

---

# Task 02.5: Formats list + read-only view + sample question

**Goal:** Students can see what a format produces before using it.

**Files to touch:** `app/formats/page.tsx`, `app/formats/[id]/page.tsx`,
new `app/components/FormatPreview.tsx`.

**Steps:**
1. Built-in formats get a read-only view at `/formats/[id]` instead of the
   "Can't edit" dead end: name, description, each type with its hint, and a
   sample question rendered in exam-paper grammar (Test I label head, italic
   "Directions:" line, numbered prompt, lettered options; a set type shows its
   stimulus block). Use static placeholder samples per answer format/layout;
   no AI call. Primary action "Use this format" (→ `/reviewer/new?format=<id>`
   if that page supports it, else plain link), secondary "Clone to edit".
2. Custom formats: the edit page shows the same preview in a collapsible
   "Preview" section.
3. Fix the breadcrumb label logic (custom → "Edit format", built-in → "Format").
4. Cards: show the description and answer-format tags (mono, no color).
   Action links get 44px hit areas.
5. "Clone" opens `/formats/new?from=<id>` as an unsaved draft instead of
   writing a copy immediately. Check how `/formats/new` initializes the
   builder and keep it consistent.
6. Delete dialog fallback copy: "the default format" instead of the
   course-code name.
7. Page padding matches sibling pages (`py-10`).

**Done when:** every built-in format id opens a useful page; tests, tsc,
lint, and format-related e2e specs pass.

---

# Task 02.6: Reviewer shell, new reviewer, OptionSelect a11y

**Files to touch:** `app/reviewer/[id]/page.tsx`, `app/reviewer/new/page.tsx`,
`app/components/OptionSelect.tsx`, `app/components/QuizSetup.tsx` (timer only).

**Steps:**
1. Reviewer tabs: proper `role="tablist"`/`tab`/`tabpanel`, `aria-controls`,
   roving tabindex, arrow-key navigation. Tabs ≥ 44px tall on mobile.
2. Take Quiz disabled reason as visible helper text, not only `title`.
3. Details/Format visibility: a "View format" link next to the reviewer's
   format name (→ `/formats/[id]`), so Formats is reachable on phones.
4. `/reviewer/new`: move "Already have an exported reviewer?" below the
   form (as a secondary link/section). Add one helper line that says how the
   reviewer's "Past exam" input differs from a format's "Learn from a past
   exam" (the reviewer's past exam supplies facts and style for this
   reviewer; a format captures question types for reuse).
5. OptionSelect: keep the visible current value in the accessible name
   (e.g. `aria-label` = "Material: None", or use `aria-labelledby` on label +
   value), `aria-activedescendant` for the highlighted option,
   `aria-selected` on options, and a check mark plus bold for the selected one.
6. Quiz timer: the "Suggested" value snaps to one of the offered options, or
   is offered as its own option.

**Done when:** keyboard-only users can switch reviewer tabs with arrows;
tests, tsc, lint, and reviewer/quiz e2e specs pass.

---

# Task 02.7: Site-wide

**Files to touch:** new `app/components/PageSkeleton.tsx`; the pages that
`return null` while loading (`app/formats/page.tsx`, `app/history/page.tsx`,
`app/progress/page.tsx`, `app/formats/[id]/page.tsx`, `app/reviewer/[id]/page.tsx`,
`app/reviewer/[id]/quiz/page.tsx`); `app/components/Navbar.tsx`;
`app/components/ReviewersHome.tsx` (copy only).

**Steps:**
1. Replace the loading `return null` with a quiet skeleton of the page frame
   (title bar + 2-3 hairline blocks, `surface-alt`, no shimmer when reduced
   motion is on). It must not shift layout when content arrives.
2. Navbar: until auth state is known, render a neutral 44px placeholder, not
   the accent avatar.
3. Copy consistency: sentence case for buttons ("+ New reviewer",
   "Take quiz"), "Today 6/10 questions" with a unit, history subtitle casing.
   Update e2e selectors that depend on the old casing.

**Done when:** no blank first paint on the listed pages; full `npm run test`,
`npx tsc --noEmit`, `npm run lint`, and `npm run test:e2e` pass.

**Out of scope:** Progress badge colors (deliberate exception; see DECISIONS).
