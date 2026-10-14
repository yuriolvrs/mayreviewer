# Plan 03: Learn a format from course material

**Goal:** Let the AI build question types from notes, slides, and other documents, not only past exams. Offer it in the Format builder and as an option when creating a reviewer.

**Decisions (confirmed with the user):**
- On the New Reviewer page the user presses a button to run inference. It does not run on Create.
- The user sees and edits the generated types before creating the reviewer.
- Every page resolves a format by id, so the generated format is stored as a custom format when the reviewer is created. It then appears in the Formats library. The user can name it first.

**Doc links:** `docs/ExamFormats-Plan.md`, `docs/DECISIONS.md`

## Task 3.1: API accepts any course document

**Goal:** `/api/infer-format` works on a past exam, notes, or slides without a mode switch.

**Files to touch:** `app/api/infer-format/route.ts`, `tests/` (add or extend an infer-format test if one exists)

**Steps:**
1. Rewrite the prompt. If the material is an exam, list its formats and quote one example. If it is notes, slides, or other teaching material, propose question types that suit its content and style. Leave `example` empty (it stays required in the schema) when nothing can be quoted.
2. Rename user-facing error text from "past exam" to "past exam or course material".
3. Keep the sanitizer, limits, rate limits, and fence handling unchanged.

**Done when:** `npx tsc --noEmit` and `npm run test` pass. The prompt text has no wording that assumes the input is an exam.

**Out of scope:** New rate limits, new models, new schema fields.

## Task 3.2: Shared client helper and Format builder copy

**Goal:** One client function runs inference. The Format builder says "past exam or course material".

**Files to touch:** `app/lib/inferFormatClient.ts` (new), `app/components/FormatBuilder.tsx`

**Steps:**
1. Move the blob-upload plus `fetch("/api/infer-format")` logic out of `runInference` into `inferFormat({ files, text, subject, uploadPrefix })` returning `{ types, unsupported }` or throwing.
2. `FormatBuilder` calls the helper. Behavior is unchanged.
3. Change the card title to "Learn from a past exam or course material". Update the helper text, the textarea placeholder and aria-labels, the button label ("Read the material and suggest types"), the blocked message, and the "Re-infer from…" summary.

**Done when:** Format builder behaves as before. Lint, tsc, and tests pass.

**Out of scope:** Data model changes. `pastExam` on the format keeps its name.

## Task 3.3: "Learn from course material" on New Reviewer

**Goal:** A last radio card in the Exam format list. When chosen, the user adds material at the bottom of the page, presses a button, and edits the generated types.

**Files to touch:** `app/reviewer/new/page.tsx`, `app/components/GeneratedFormatPanel.tsx` (new, optional)

**Steps:**
1. Add a card "Learn from course material" with the hint "The AI builds question types from the notes and slides you add below." It is not a stored format. Track it with local state.
2. When it is selected, hold a draft `ExamFormat` in state (empty until inference). Use it as `format` for `QuestionCountControl` once it has types.
3. Show a panel next to the Course material field (bottom of the page) with: a prompt to upload course material below, a "Suggest question types" button (disabled and explained when there is no text or file, or when offline), and error and unsupported notes like the builder.
4. Read the input from the `notes` text and the stored `notes` attachments for `draftId`. Use the helper from 3.2.
5. Show the result as an editable list: label, default count, remove. Add a format name input (default "<reviewer name> format"). Keep it simple: no tip or example editing here.
6. On Create: if the generated format is chosen and has types, call `saveCustomFormat` with a new id, set `examFormatId` to it, and use the counts. If it is chosen but empty, show an error and do not create.
7. Add a "Save to Formats" button in the panel that saves it right away under the chosen name, so the user can reuse it. Creating the reviewer afterward reuses that saved id and does not save a second copy.

**Done when:** Manual check in the browser: pick the card, add notes, press the button, see types, change a count, create the reviewer, open Questions, and see the generated types. The format appears in `/formats`. Lint, tsc, and tests pass. Add an e2e or unit test where the repo's patterns allow it.

**Out of scope:** Inline format reference on reviewers, hidden formats, changes to generation.
