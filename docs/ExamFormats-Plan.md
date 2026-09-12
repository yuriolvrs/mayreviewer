# Exam Formats Plan: flexible subjects, Modified True/False, past-exam inference

Header text (site title, case-sensitive): **`pre, May Reviewer ka ba?`**

Today the app assumes one exam: 4 hardcoded CSOPESY question types
(identification / scenario / timeline / code) baked into the prompt text, the
JSON response schema, the generation planner, and the renderers. A math formula
question or a language sentence-blank has nowhere to go. This plan makes
**question-type definitions data, not code**, so any subject's exam format can
be expressed — without ever exposing a raw LLM prompt box as the interface.

Decisions below were locked via clickable Q&A. Anything marked Sug (suggestion)
is still open.

---

## Chapter 1 — Modified True/False as the 5th type (pilot, shippable alone)

**Goal:** prove the "add a type" path end-to-end (counts UI, filters, scope
chips, planner, schema, verify, seed, tests) before generalizing. MTF is
**standalone** — its statements live inside the question text, self-contained,
no shared stimulus.

**Locked:** 4–5 statements per question (model's pick) · 4 options (consistent
with all other types) · model-written combination options (covers any truth
pattern; correctness enforced by the verify pass) · existing reviewers auto
re-split 5 ways (totals preserved, hand-tuned mixes reset — accepted) · new
reviewers default to an equal 5-way split.

- [x] 1.1. `app/types/index.ts`: add `"modified-tf"` to `QuestionType`.
- [x] 1.2. `app/lib/questions.ts`: extend `QUESTION_TYPES` + `TYPE_LABELS`
      ("Modified True/False"). Rendering = prose with `white-space: pre-wrap`
      (statements on separate lines, normal font — distinct from timeline/code
      mono), applied identically in QuestionsTab / QuizTaking / QuizResults so
      all three screens stay consistent. Quiz time-estimate counts it as a
      normal question.
- [x] 1.3. `app/api/generate/route.ts`: new prompt block — write 4–5 numbered
      statements, secretly fix each statement's truth value, then emit 4
      combination options with **exactly one** matching the true pattern
      (e.g. "Statements 1 and 2 are true", "All statements are true", "None of
      the statements are true"). Standalone response-schema enum gains the
      type; `MC_FIELDS` reused unchanged. Verify pass unchanged (generic
      re-derive works; drops are safe since standalone has no set-numbering
      hazard).
- [x] 1.4. `app/lib/generationPlan.ts`: no change expected (`STANDALONE_TYPES`
      auto-includes it) — cover with a 5-way mix test instead.
- [x] 1.5. `app/lib/storage.ts normalize()`: a breakdown that exists but lacks
      the `modified-tf` key gets a fresh 5-way `splitCountEvenly(total)` —
      never a partial patch, never a re-split of already-migrated reviewers.
- [x] 1.6. Import path (`app/lib/reviewerFile.ts`), e2e seed, unit tests:
      validator accept-table, planner mix, 4-key → 5-key migration preserving
      the total, answer-by-text quiz case (shuffle applies to MTF too).

**Done when:** a Reviewer generates → reviews → quizzes MTF end-to-end with no
console errors.

---

## Chapter 2 — Format data model + library + migration

**Goal:** types become data; CSOPESY becomes one preset among many.

- [x] 2.1. New `app/lib/examFormats.ts`:
  `ExamFormat { id, name, description, types: FormatTypeDef[] }`,
  `FormatTypeDef { key, label, format, shape, stimulus, guidance?, defaultCount }`.
  (No localStorage store yet — only built-ins exist; the custom-format store
  lands with the builder in Chapter 3.)
- [x] 2.2. Built-in `CSOPESY Final` format = the 5 post-Chapter-1 types frozen
  as data (MTF included).
- [x] 2.3. `Reviewer` gains `examFormatId`; existing reviewers migrate to
  `'csopesy-final'` with questions/history untouched; attempts snapshot
  `{ examFormatId, examFormatName }` (backfilled from the reviewer) so history
  stays truthful after format edits.
- [x] 2.4. Generation derives schema type enums, the set/standalone split,
  and count controls from the format's type list. `Question.type` stays a
  global-union key (custom string keys arrive with the builder); the shared
  validator stays global, so per-format membership checks also wait for
  Chapter 3, when a second format can actually make them load-bearing. Same
  for the planner's set-placement order — the only existing format's sets
  are exactly timeline/code.
- [x] 2.5. Formats library page (`/formats`, in the nav) + format picker in the
  new-reviewer flow (default: CSOPESY Final, deep-linkable via
  `?format=`); format also changeable later in Details. Home needs no picker
  — creation is the one entry point.

**Done when:** old reviewers open unchanged under the preset; new reviewers
can pick a format; a format edit never rewrites history. ✅ (verified:
`tsc` clean, 136/136 unit, 17/17 e2e incl. picker + library tests, `build`
clean across 12 routes; format-name display in history deferred — with one
format in existence every row would read identically, so it ships when
Chapter 3 makes it informative.)

---

## Chapter 3 — Builder UI + day-one presets

**Goal:** users create and edit formats with no prompt-writing. (Sug: presets are
templates only — picking one pre-fills a fully editable format, never a locked
category.)

- [x] 3.1. Builder form per type (label, answer format, shape, stimulus kind,
  guidance, count) + per-type example fields + clone / edit / delete in
  the library (`/formats`, `/formats/new`, `/formats/[id]`; customs in a
  `mayreviewer-formats` store, built-ins read-only with clone-first editing).
- [x] 3.2. Day-one presets as prefilled `ExamFormat` objects — Math,
  Language, Science, History. No new renderers: everything maps onto
  existing standalone/set × stimulusKind combos, and the prompt is compiled
  from label/guidance/examples (built-in keys keep tuned prose).
- [ ] 3.3. Sync the plan mockup against shipped behavior. (Superseded: the
  Desktop scratch mockup served the decision phase; the shipped builder is
  the reference now. Left untouched deliberately.)

**Done when:** a Math format can be built starting from the Language preset,
purely through the UI, and generate a clean batch. ✅ (builder create +
clone/edit/delete verified in-browser and e2e; live generations from preset
definitions: custom MC + true/false counts honored, prose sentence-blank
set with one question per blank after one prompt fix for non-code sets,
full 8-question Language-clone batch clean with 0 failures; `tsc` clean,
152/152 unit, 18/18 e2e, `build` clean.)

---

## Chapter 4 — Past-exam inference + reviewer-level exam

**Goal:** upload a past exam, get editable type drafts; reviewers can attach
their own. Inference is **soft**: the model proposes, the user disposes — never
auto-saved, never silently locked.

**Locked:** past exams teach format **and** content · kept on the format (not
one-shot) · unsupported formats flagged, never created · mandatory review gate
· reviewer-level attachment in addition to format-level · formats: PDF, JPG,
PNG, WebP, DOCX, TXT, pasted text (same caps: ≤10 files, ≤15MB each, ≤40MB
total) · HEIC rejected with guidance · exams assumed printed/digital.

- [x] 4.1. Upload pipeline takes JPG/PNG/WebP end to end (mime allowlist +
  magic-byte signatures + Blob token route + File API/OCR paths, all shared
  with PDFs). DOCX/TXT/paste reused as-is. HEIC rejected with guidance, not
  silence.
- [x] 4.2. `POST /api/infer-format` (own rate-limit bucket, fenced + capped):
  schema-constrained drafts `{ label, answerFormat, shape, stimulusKind,
  guidance, example, suggestedCount }` plus flagged `unsupported` notes.
  Server re-validates every draft. Attachment intake extracted to a shared
  `app/api/lib/attachments.ts` both routes use; no Mistral fallback (clear
  error + retry instead — documented).
- [x] 4.3. Review gate = the builder itself (edit/delete/add-manual, replace
  only behind an explicit confirm dialog, save always manual). Past exam kept
  on the format (files in a `format-attachments` store, text capped at 30k in
  the record) and included at generation as a fenced `PAST_EXAM` block.
- [x] 4.4. Reviewer-level past exam = third source section (text +
  files under field `pastexam`, exported like other text). Questions drawn
  from past-exam material carry `source: "pastexam"` ("Past exam"
  label/filter). `notes` / `project` / `manual` unaffected.

**Done when:** a sample midterm → drafts → reviewed format → generated batch
with provenance labels, no errors. ✅ (live: MTF inferred + matching flagged
as unsupported; past-exam text generated a `pastexam`-sourced question;
image token handshake + real-photo browser upload flow pass; Gemini-reads-photo
segment relies on documented provider support + the shared code path.
`tsc` clean, 159/159 unit, 20/20 e2e, `build` clean.)

---

## Chapter 5 — Verification + rollout

- [x] 5.1. Phase-7-style Playwright pass extended: pre-format reviewer migration
  covered e2e (seeded legacy shape normalizes on open, total kept); inference
  review gate covered by UI-presence e2e plus a live inference run; MTF render
  + shuffle scoring since Chapter 1. Follow-up hardening: custom-format e2e
  (labels, filters, scope, scoring, prose-set quoting, switch re-seeds,
  clone/delete/validation/deep-link, photo upload) and a `useFormats` hook so
  custom lists load post-mount instead of hydrating mismatched.
- [x] 5.2. Full suite green (`tsc`, vitest, e2e, `build`) + a real-use pass: a
  Filipino reviewer on the Language preset, created/filled/generated/quizzed/
  recorded end to end against the live API.
- [x] 5.3. `DevPhases` Phase 9 entry + About-page limits (accepted formats,
  MTF, inference) both done.

---

## Appendix — build order

1. MTF as 5th type (Chapter 1) — shippable alone, proves the path.
2. Format model + library + migration (Chapter 2).
3. Builder UI + presets (Chapter 3).
4. Past-exam inference + reviewer-level exam (Chapter 4).
5. Verification + rollout (Chapter 5).

Deferred deliberately (unchanged): free-text/numeric answers (breaks shuffle +
verify + scoring) and multi-select. Raw prompt input stays out; per-type
plain-language guidance is the power-user path.

## Post-plan hardening (injection review)

Prompt surfaces the new chapters added, reviewed as one: no `dangerouslySetInnerHTML`
anywhere (React text only); all fence labels are fixed literals; format labels/names
flatten to single lines at sanitize time; guidance/examples keep newlines but lose
bidi spoofing controls (`stripSpoofingControls`, unit-tested); verify-prompt question
blocks are fenced per request. Containment stays what it was: schema pinning +
re-validation, with the model tool-less and its output rendered as text.

---
*Plan created from clickable Q&A; all decisions above are locked unless marked
Sug. Pairs with PRD / TechDesign / AppFlow / DevPhases in this folder.*
