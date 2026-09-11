# Exam Styles Plan: flexible subjects, Modified True/False, past-exam inference

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

## Chapter 2 — Style data model + library + migration

**Goal:** types become data; CSOPESY becomes one preset among many.

- [ ] 2.1. New `app/lib/examStyles.ts` (localStorage key
      `mayreviewer-styles`, same seam pattern as `storage.ts`):
      `ExamStyle { id, name, subjectField?, sourcePastExam?, types: StyleType[] }`,
      `StyleType { key, label, answerFormat: 'mc' | 'true-false' | 'modified-tf', shape: 'standalone' | 'set', stimulusKind: 'none' | 'prose' | 'table' | 'code' | 'formula', guidance?, examples?, defaultCount, setSize? }`.
- [ ] 2.2. Built-in `CSOPESY Final` style = the 5 post-Chapter-1 types frozen
      as data (MTF included).
- [ ] 2.3. `Reviewer` gains `examStyleId`; existing reviewers migrate to
      `'csopesy-final'` with questions/history untouched; attempts snapshot
      the style so history stays truthful after style edits.
- [ ] 2.4. Generation derives the planner set-type list, schema type enums,
      and count controls from the style's type list. `Question.type` stays a
      style-scoped string key; validation checks membership in the reviewer's
      style rather than a global array.
- [ ] 2.5. Styles library page + style picker in the Home / new-reviewer flow
      (default: CSOPESY Final).

**Done when:** old reviewers open unchanged under the preset; new reviewers
can pick a style; a style edit never rewrites history.

---

## Chapter 3 — Builder UI + day-one presets

**Goal:** users create and edit styles with no prompt-writing. (Sug: presets are
templates only — picking one pre-fills a fully editable style, never a locked
category.)

- [ ] 3.1. Builder form per type (label, answer format, shape, stimulus kind,
      guidance, count) + per-type example fields + clone / edit / delete in
      the library.
- [ ] 3.2. Day-one presets as prefilled `ExamStyle` objects — Math (concept
      recall / which-formula / solve-and-pick / worked-problem set over a
      formula stem), Language (vocabulary / usage-in-context / sentence-blank
      set over prose — same set machinery as code-blank, different stimulus
      kind), Science (definition / scenario / experiment-trace set over a
      table), History (fact recall / cause-effect / true-false). No new
      renderers: everything maps onto existing standalone/set × stimulusKind
      combos.
- [ ] 3.3. Sync the plan mockup against shipped behavior.

**Done when:** a Math style can be built starting from the Language preset,
purely through the UI, and generate a clean batch.

---

## Chapter 4 — Past-exam inference + reviewer-level exam

**Goal:** upload a past exam, get editable type drafts; reviewers can attach
their own. Inference is **soft**: the model proposes, the user disposes — never
auto-saved, never silently locked.

**Locked:** past exams teach format **and** content · kept on the style (not
one-shot) · unsupported formats flagged, never created · mandatory review gate
· reviewer-level attachment in addition to style-level · formats: PDF, JPG,
PNG, WebP, DOCX, TXT, pasted text (same caps: ≤10 files, ≤15MB each, ≤40MB
total) · HEIC rejected with guidance · exams assumed printed/digital.

- [ ] 4.1. Extend the upload pipeline to JPG/PNG/WebP (mime allowlist +
      magic-byte signatures + Blob token route); DOCX/TXT/paste paths reused
      as-is. Reuse the Blob → provider-File-API pattern: PDFs and images read
      natively by Gemini; Mistral fallback already uploads with OCR purpose.
- [ ] 4.2. New `POST /api/infer-style` (own rate-limit bucket, fenced +
      capped like `/generate`): schema-constrained output of type drafts
      `{ label, answerFormat, shape, stimulusKind, guidance, exampleQuestion, suggestedCount }` — constrained to supported enums so inference can only
      propose renderers the app can actually render and verify. Anything else
      returns as flagged notes.
- [ ] 4.3. Mandatory review screen (edit / delete / add-manual / confirm) →
      save. Past exam kept on the style (PDFs in IndexedDB keyed by styleId,
      text capped in the style object) and included at generation as a fenced
      `PAST_EXAM` format+content block.
- [ ] 4.4. Reviewer-level optional past-exam attachment, fed to generation the
      same fenced way; questions drawn from it carry a new `source:
      "pastexam"` ("Past exam" label/filter), preserving the PRD's provenance
      rule. `notes` / `project` / `manual` questions unaffected.

**Done when:** a sample midterm → drafts → reviewed style → generated batch
with provenance labels, no errors.

---

## Chapter 5 — Verification + rollout

- [ ] 5.1. Extend the Phase-7-style Playwright pass: all types incl. MTF
      render + shuffle scoring, inference review gate, migration branches
      (4-key → 5-key, pre-style → styled).
- [ ] 5.2. Full suite green (`tsc`, `eslint`, vitest, e2e) + a real-use pass
      with at least one non-CS style.
- [ ] 5.3. Update the `DevPhases` checklist and the About-page limits
      (accepted formats, MTF, styles, inference).

---

## Appendix — build order

1. MTF as 5th type (Chapter 1) — shippable alone, proves the path.
2. Style model + library + migration (Chapter 2).
3. Builder UI + presets (Chapter 3).
4. Past-exam inference + reviewer-level exam (Chapter 4).
5. Verification + rollout (Chapter 5).

Deferred deliberately (unchanged): free-text/numeric answers (breaks shuffle +
verify + scoring) and multi-select. Raw prompt input stays out; per-type
plain-language guidance is the power-user path.

---
*Plan created from clickable Q&A; all decisions above are locked unless marked
Sug. Pairs with PRD / TechDesign / AppFlow / DevPhases in this folder.*
