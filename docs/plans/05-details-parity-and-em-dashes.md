# Plan 05: Details tab parity and no em dashes

**Goal:** The Details tab of a created reviewer matches the New Reviewer page in order, wording, and controls. No em dash appears on the website.

**Doc links:** `docs/plans/04-new-reviewer-ux.md`, `docs/plans/03-learn-from-material.md`

## Task 5.1: Shared sections, Details tab matches New Reviewer

**Files to touch:** `app/components/DetailsTab.tsx`, `app/reviewer/new/page.tsx`, new shared components under `app/components/` (for example `ReviewerInfoFields.tsx`, `TopicsField.tsx`, `FormatPicker.tsx`), `app/reviewer/[id]/page.tsx`

**Steps:**
1. Extract the parts both screens render into shared components so they cannot drift: Reviewer info, Topics, and the format section (saved-format dropdown with the selected format's type labels, plus the "Learn from my material" mode with `GeneratedFormatPanel`).
2. Details tab order becomes: Reviewer info, Course material, Project material, Past exam, Exam format, Question count, Topics, Danger zone. Same section titles and helper copy as New Reviewer.
3. Details tab keeps its own behavior: material autosaves, name/subject/topics/counts go through the sticky "Save details" bar, format changes save at once.
4. Learn mode on Details: the panel reads this reviewer's stored notes and past exam (same sources line). Applying it saves a new custom format (same id-reuse rule as New Reviewer), sets `examFormatId`, and resets counts to the suggested ones. Show the existing "Switch format?" confirm when counts were edited.
5. Header: drop the duplicated words in "Format: X format" if the format name already ends in "format"; do not change stored names.
6. Update e2e tests that depend on the Details order or controls.

**Done when:** Both screens look and read the same at 1280px and 375px. Lint, tsc, unit tests, and affected e2e specs pass.

**Out of scope:** Questions and Import/Export tabs.

## Task 5.2: Remove em dashes from user-visible text

**Files to touch:** any file under `app/` that renders or returns user-facing text; `README.md` is out of scope.

**Steps:**
1. Replace each em dash (U+2014) in JSX text, string literals shown in the UI, page metadata and titles, and API error messages returned to the client.
2. Pick the replacement per sentence: a period, a comma, a colon, or parentheses. Do not use a hyphen as a stand-in. Keep the meaning.
3. Do not touch code comments or the instruction text sent to the AI model in prompts, except task 4.
4. Task 4: add one line to the generation and inference prompts (`app/api/generate/route.ts`, `app/api/infer-format/route.ts`, grading if it returns prose): "Do not use em dashes in any text you write." Model output reaches the site.
5. Update tests and e2e expectations that assert on changed strings.

**Done when:** `grep -rn "—" app` returns only comments and prompt text. Lint, tsc, unit tests, and e2e pass.

**Out of scope:** Docs, comments, en dashes.
