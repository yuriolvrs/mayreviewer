# App / User Flow Document: "May Reviewer" MVP

Header text (site title, case-sensitive): **`pre, May Reviewer ka ba?`**

This document maps every screen, state, and transition for Claude Code to build against. It assumes the data model and stack from `TechDesign-ExamReviewer-MVP.md` (Next.js, `localStorage`, `Reviewer`/`Question` types).

## Navigation Structure (Revised)

There is **no global tab bar**. Structure is now:

- **Home** — a flat list of all your Reviewers (this is the app's root page)
- **Reviewer Space** — clicking into a Reviewer takes you to its own page, which has **its own local tab bar scoped to that Reviewer only**: `Details` | `Questions` | `Import/Export` (sources live inside Details; generation lives in Questions)
- **Quiz** — reached from inside a Reviewer's space via a button, but is its **own separate page**, not one of the three local tabs (since taking a quiz is a focused, full-screen task)

```
Home (Reviewer list)
  └─ Reviewer Space (/reviewer/[id])
       ├─ Tab: Details (info + source material)
       ├─ Tab: Questions (pool, generate, edit)
       ├─ Tab: Import/Export
       └─ [Quiz button] → Quiz Page (/reviewer/[id]/quiz) — separate page
```

Content, questions, export/import, and quizzing are scoped to **one Reviewer at a time** — no combined quiz, no global export.

**Exception (added after this doc's first draft): a global History screen at `/history`,** reachable from the persistent nav. It's the one cross-Reviewer view in the app. The per-Reviewer Quiz History on Screen 4 stays as-is; `/history` is an additional roll-up across all Reviewers, not a replacement. See Screen 5 below.

---

## Screen 1: Home (Reviewer List — root page)

**This is the first thing you see when opening the app.** Header reads `pre, May Reviewer ka ba?`.

### Empty State (no Reviewers yet)
- Message: "No Reviewers yet — create one to get started."
- Button: **+ New Reviewer** → Screen 2

### Populated State
- List of Reviewer cards, each showing:
  - Name
  - Question count (e.g., "42 questions")
  - Created date
  - Quick actions: **Open** (→ Screen 3, Reviewer Space), **Delete**
- Button: **+ New Reviewer** → Screen 2

### Delete Flow
- Click Delete on a card →
  - **If no quiz history exists for it:** confirm dialog ("Delete this Reviewer and its N questions?") → confirm → removed
  - **If quiz history exists:** confirm dialog explicitly warns ("This Reviewer has quiz history — deleting it will also delete that history. Continue?") → confirm → removed

---

## Screen 2: New Reviewer (separate page)

- **Reviewer Name** — text input, required
- **Subject** — text input, optional (e.g. "Intro to Operating Systems") — passed to the generation prompt as context, doesn't hardcode any topic list
- **Topics** — dynamic numbered list, optional, add/remove rows (e.g. "1. Scheduling", "2. Paging") — weights question generation toward these when present; no fixed/hardcoded topic set, this is just per-Reviewer input
- Button: **Create Reviewer**
  - Validates name is non-empty (Subject/Topics are optional)
  - On success → saves to `localStorage` via `saveReviewer()` → redirects to **Screen 3** (Reviewer Space) for this new Reviewer, landing on its **Upload** tab, since that's the natural next step

*(Content upload itself now happens inside the Reviewer Space's Upload tab, not on this creation page — keeps the creation step to just naming/subject/topics, and the Upload tab becomes the one place content ever gets added or edited, whether at creation or later.)*

---

## Screen 3: Reviewer Space (per-Reviewer page, `/reviewer/[id]`)

### Header (always visible, above the local tabs)
- Reviewer name (editable inline)
- Question count, created date
- Button: **Quiz this Reviewer** → Screen 4 (Quiz Page) — disabled with a message ("No questions yet — generate some in the Upload tab first") if question count is 0
- Button: **Delete Reviewer** (same confirm/warn logic as Screen 1)

### Local Tab Bar: `Upload` | `Edit Questions` | `Import/Export`

#### Tab: Upload
- **Notes** — two-mode field: **Upload files** (default; drag-drop or picker, multiple PDF/DOCX/TXT at once) or **Paste text**. PDFs are kept as PDFs (not flattened to text) and sent to Gemini directly at generation time, since Gemini has native PDF vision — it can read diagrams/images/charts inside a PDF, not just its text. DOCX/TXT are still converted to plain text client-side, since Gemini doesn't get that same document-vision treatment for non-PDF formats.
- **Project Material** — same two-mode field, visually distinct from Notes, optional
- Auto-saves or an explicit **Save Content** button (either is fine; explicit save is simpler to build correctly) — this governs the paste/extracted-text content only. PDF attachments save immediately on upload (not gated by the Save Content button), since they're a distinct storage mechanism (IndexedDB, not the Reviewer's saved text).
- **Generate Questions section:**
  1. Button: **Generate Questions** — calls `/api/generate` with this Reviewer's notes + project material text, PLUS its PDF attachments (+ subject/topics if set); button shows a loading state while the request is in flight
     - **Success:** returned questions appended to this Reviewer's question pool; success message with count added (e.g., "12 questions added")
     - **Failure (API error/rate limit/malformed response):** error message shown (e.g. "Couldn't generate questions — try again") and nothing already in the Reviewer is lost; the button remains available to retry

#### Tab: Edit Questions
Shows **only this Reviewer's questions** (no cross-Reviewer view needed now that everything is scoped).

- **Filter by Type** (Identification / Scenario / Timeline / Code, includes "All")
- **Filter by Source** (Notes / Project, includes "All")
- List of question rows:
  - Question text (truncated with expand)
  - Type badge, Source badge
  - Inline **Edit** (question text, the 4 options, correct answer)
  - **Delete** button
- **Empty state:** "No questions yet — go to the Upload tab to generate some."
- **No "approved" gate:** any question that comes out of the paste-parse step (Upload tab) is immediately eligible for quizzing. This tab is optional cleanup, not a required checkpoint.

#### Tab: Import/Export
Scoped to this Reviewer only:
- **Export** button — downloads this Reviewer (info + notes + project material text + questions) as a `.json` file. **Uploaded PDF attachments are NOT included** — export/import only needs to carry the Reviewer's details and questions, not its files (explicit decision, since PDFs can be many/large and are re-uploadable if needed).
- **Import** file picker — imports a previously exported single-Reviewer `.json` file, merging its questions into this Reviewer's pool (does not create a new Reviewer or overwrite this one's name/content)
- This is also how you'd hand a Reviewer to a classmate: they create their own empty Reviewer, then Import the file you sent them (they'd need to re-upload any PDFs separately, since those don't travel with the export)

---

## Screen 4: Quiz Page (separate page, `/reviewer/[id]/quiz`)

Reached only via the **Quiz this Reviewer** button in Screen 3's header. Always scoped to that one Reviewer — there is no option to combine Reviewers.

### Quiz Setup (default view of this page)
- **Feedback mode:** toggle — "Show correct/incorrect immediately per question" vs. "Only show results at the end"
- Button: **Start Quiz**
- **Quiz History (this Reviewer only):** list of past attempts for this specific Reviewer — date, score. The global `/history` screen (Screen 5) additionally rolls attempts up across all Reviewers.

### Quiz-Taking Screen (after Start Quiz)
- **Layout:** one long scrollable page of all this Reviewer's questions, with a **side panel** listing question numbers
- **Side panel indicators per number:**
  - Unanswered (default/neutral state)
  - Answered (distinct color/checkmark)
  - Marked "Unsure — recheck later" (distinct color/flag icon)
  - Clicking a number scrolls/jumps to that question
- **Per-question:**
  - Question text (rendered with any embedded table/code/diagram as plain text/markdown from the JSON)
  - 4 MC options (radio-style, single select)
  - **"Mark as unsure — recheck later"** toggle/checkbox, independent of whether it's answered
  - If **immediate feedback mode:** selecting an option instantly shows correct/incorrect inline, but the answer remains changeable
  - If **end-only feedback mode:** no correctness shown while taking the quiz, just the answered/unanswered state
- Button at the bottom (and/or fixed footer): **Submit Quiz**
  - Confirms if any questions are still unanswered ("3 questions unanswered — submit anyway?")

### Note on the "unsure" flag's lifecycle
This flag is **scoped to a single quiz attempt** — it resets each time you start this Reviewer's quiz fresh. It is not a persistent property stored on the question itself.

### Results Screen (after Submit Quiz)
- **Score:** e.g., "14/20 (70%)"
- **Missed questions list:** your answer, the correct answer, full question text
- **Unsure-flagged questions list:** shown even if answered correctly, separate section from "missed"
- Button: **Retake** — immediately restarts this Reviewer's quiz fresh (unsure flags reset)
- Button: **Back to Reviewer** — returns to Screen 3
- This attempt gets saved into this Reviewer's quiz history (visible in this page's Quiz History section on next visit)

---

## Screen 5: History (global, `/history`)

Added after this doc's first draft; reachable from the persistent nav rather than from inside a Reviewer. The only cross-Reviewer view in the app.

- Rolls up quiz attempts across **all** Reviewers — the per-Reviewer list on Screen 4 stays where it is
- Reads through `getQuizHistory()` in `lib/storage.ts` like every other screen; attempts are already stored globally under one key and filtered per Reviewer, so a cross-Reviewer roll-up needs no new storage shape
- **Status: shipped.** Lists every attempt across all reviewers, newest first, grouped by reviewer with a reviewer filter. Attempts carrying their question set reopen in the quiz results screen via `?attempt=`.

---

## Cross-Screen Notes

- **Every screen after Home is scoped to a single Reviewer.** There is no place in the MVP that shows data from more than one Reviewer at once — this was an explicit simplification from an earlier draft that had cross-Reviewer views.
- **Reviewer flexibility:** nothing in this flow assumes a fixed scope per Reviewer — one might hold a single lecture's notes, several topics, or (for a future different exam) something else entirely.
- **Data consistency:** every screen reads/writes through the same `lib/storage.ts` functions defined in the TDD (`getReviewers`, `saveReviewer`, `deleteReviewer`) plus ones this flow implies (`saveQuizAttempt(reviewerId, ...)`, `getQuizHistory(reviewerId)`) — keeping these in one file is what makes a future Supabase swap contained.

---

## Suggested Build Order (maps onto TDD's feature order)

1. Screen 1 (Home, Reviewer list, empty state) + Screen 2 (New Reviewer) — proves storage works
2. Screen 3's Upload tab, content section only (view/edit notes) — no generation yet
3. Screen 3's Import/Export tab — cheap now, big payoff later
4. Screen 3's Upload tab, Generate Questions section (prompt builder + paste-parse) — the riskiest part
5. Screen 3's Edit Questions tab (per-Reviewer list + filters)
6. Screen 4 (Quiz setup → taking → results) — build setup first, then taking, then results
7. Wire up quiz history persistence last, once quiz-taking itself works end-to-end

---
*Document created: 2026-08-09*
*Status: Draft — pairs with PRD-ExamReviewer-MVP.md and TechDesign-ExamReviewer-MVP.md*
*Revision note: this replaces the earlier draft's global-tabs structure with per-Reviewer scoping, and updates the header text/working name.*
*Revision note (2026-08-09, later): Screen 2 gains optional Subject + Topics fields; Screen 3's Generate Questions section is now a single automatic Generate button (in-app Gemini API call) instead of the Build Prompt/paste-response manual loop — see TechDesign for the underlying API change. Visual styling for all screens now follows the Design Spec handoff bundle, with this document's screen structure and behavior taking priority over that spec wherever the two disagree.*
*Revision note (2026-08-09, later still): Notes/Project Material upload no longer flattens PDFs to text — PDFs are kept native (IndexedDB-stored, sent directly to Gemini at generation time) since Gemini has native PDF vision; only DOCX/TXT are still text-extracted. Export/Import explicitly excludes PDF attachments — see TechDesign.*
