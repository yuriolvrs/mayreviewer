# Product Requirements Document: "May Reviewer" MVP

## Product Overview

**Header Text (site title, case-sensitive as written):** `pre, May Reviewer ka ba?`
**Planned URL:** something like `mayreviewer.vercel.app`
**Note:** The header text is the actual on-page display copy, not just an internal codename — keep it exactly as written above (casing matters) wherever it appears in the UI.
**Tagline:** Turn your notes into a practice exam that matches your professor's question style.
**Launch Goal:** Have a working practice quiz generated from your own notes, ready to study from before your OS final.
**Target Launch:** Within the next 3-4 days (final is under a week away).

**Scope note:** This is meant to grow into a general-purpose exam reviewer over time, but the MVP only supports **one exam profile**: your Intro to Operating Systems final, using the 4 question formats below. Future exam types (different courses, different question formats) are out of scope for now — the goal is just to not paint this into an OS-only corner architecturally, in case you build on it later.

**Core concept — Reviewer:** The app's main organizational unit is a **Reviewer** — a bucket of uploaded content (notes/slides, optionally project material) plus the questions generated from it. A Reviewer is deliberately flexible in scope: it might cover one lecture's notes, a handful of subjects, or everything you have for the whole final — whatever you choose to upload into it at creation time. There's no forced sub-grouping within a Reviewer; it stays flat.

## Who It's For

### Primary User: You (and later, classmates)
A student in Intro to Operating Systems who already knows the midterm format and wants an AI-assisted way to turn lecture notes into realistic practice questions before the final.

**Their Current Pain:**
- No copy of the actual exam yet — has to reconstruct the *style* of questions from memory
- Manually writing practice questions from scratch is slow, especially scheduling diagrams and code-blank questions
- Existing quiz apps don't handle OS-specific formats (process states over time, C++ fill-in-the-blank)
- The exam also references the semester-long class project (an OS emulator), and generic note-based quiz tools have no way to pull questions from project specs or code

**What They Need:**
- Upload notes/slides and get relevant practice questions back fast
- Also feed in the class project (specs, and possibly the repo itself) so questions can reference it, since the exam does
- A way to review/edit AI-generated questions before trusting them to study from
- A quiz-taking mode that mimics the midterm's actual question types

### Example User Story
"I upload my scheduling algorithms lecture notes. The app generates a mix of identification questions, a scheduling timeline question ('where is Process B during cycle 4?'), and a C++ snippet with a blank for a semaphore variable. I review and tweak a couple, then take the quiz to check my understanding."

## The Problem We're Solving

The final is described as similar in *format* to the midterm, but no copy of the midterm exists yet to study from directly. Building question *types* that match the known format — rather than generic flashcards — is the actual value here. Off-the-shelf quiz/flashcard apps don't understand OS-specific question shapes like "process state at scheduling cycle X" or fill-in-the-blank C++ snippets, so notes have to be manually turned into that format by hand today.

**Important scope note:** The 4 question types below come from the *midterm*, which the professor said the final will resemble in format. But the final covers the *whole semester's* topics, not just what was on the midterm (scheduling was a midterm topic; the final will add things like paging, memory management, and whatever else was covered — full topic list TBD). So: **question types are fixed, topic coverage is NOT fixed to the midterm's topics.** The app needs to generate all 4 formats for *any* OS topic fed into it, not just scheduling/processes. The specific list of topics will be provided later (when moving into Claude Code) — this PRD should not hardcode topic names anywhere.

## Question Types (Core Scope — confirmed from midterm format, applies across ALL semester topics)

1. **Identification / Definition MC** — describe a term or concept, pick the correct match. (e.g., "which page replacement algorithm is this?", not just scheduling terms)
2. **Scenario-to-Component MC** — describe a situation, pick which OS component/concept it illustrates. (e.g., could be a scheduling scenario, a paging/memory scenario, a deadlock scenario, etc.)
3. **Timeline / State-Tracking Questions** — given a process over time, ask "where was X during step Y?" This pattern showed up as CPU scheduling on the midterm, but the same *shape* of question could apply to other topics with a state-over-time structure (e.g., page faults over a reference string, process states through their lifecycle). Should be built generically enough to handle whatever topic it's pointed at, not hardcoded to CPU scheduling.
4. **Code Fill-in-the-Blank (C++)** — a code snippet with one or more blanks; multiple choice options are variable names, function names, or keywords. Applies to any topic with code examples in the notes (synchronization primitives, memory allocation, etc.), not just scheduling code.

All four *formats* must be supported in the MVP — this is non-negotiable since it's what the exam will actually look like. But none of the 4 types should be scoped or hardcoded to scheduling/processes specifically — they need to work for whatever topic's notes get uploaded (paging, memory management, deadlocks, file systems, etc., as covered across the semester). The full topic list will be supplied later in Claude Code.

### Additional Content Source: The Class Project (OS Emulator)
The class has been building an OS emulator as a semester-long project (started before the midterm), and the midterm included questions that referenced it directly. So uploaded material is a **second input source alongside notes/slides**, not a separate question type — any of the 4 formats above can be generated *from* the project instead of *from* lecture notes. Inputs may include:
- Project specs/requirements document (to be uploaded later)
- Possibly the project's actual code repo (may point Claude Code at it directly rather than uploading files)

This means the app's ingestion step needs to treat "notes" and "uploaded material" as two source types that both feed the same question-generation pipeline — not bolt project-awareness on as an afterthought.

## User Journey

### Discovery → First Use → Success
1. **Land on the app** → upload notes/slides (text paste or file upload) into a **Reviewer** (e.g., a Reviewer for just "Paging," or one big Reviewer covering everything you have so far — Reviewers are flexible, not tied to a fixed scope).
2. **AI drafts a batch of questions** across the 4 types above, based on the uploaded content and general OS conventions (since no real midterm sample exists yet).
3. **Review/edit screen** — user can accept, edit, delete, or regenerate individual questions before they go into the quiz pool.
4. **Take the quiz** — multiple choice interface, mimics exam pacing, gives a score at the end and flags wrong answers with the source note excerpt.
5. **(Stretch) Share** — generate a link/deploy so classmates can take the same quiz set.

## MVP Features

### Must Have for Launch (P0)

#### 1. Notes & Project Material Upload
- **What:** Upload/paste notes or slide text per Reviewer, AND separately upload/reference the class project (OS emulator) — specs now, possibly pointing at the repo once in Claude Code.
- **User Story:** As a student, I want to feed in both my notes and my project so the app can generate questions that reference either, since the real exam does both.
- **Success Criteria:**
  - [x] Supports pasted text for notes, AND multi-file upload (PDF/DOCX/TXT) with client-side text extraction — pulled up from "if time allows" to P0 since PDFs turned out to be the primary expected upload, not plaintext paste
  - [ ] Separate path for uploaded material (specs doc upload; repo reference is a stretch depending on how Claude Code integration goes)
  - [ ] Content is stored per Reviewer, with uploaded material tagged distinctly from notes so it's clear which questions draw from which source

#### 2. AI Question Generation (4 types, any topic, two content sources)
- **What:** Generate identification, scenario, timeline/state-tracking, and code-fill-in-blank questions from either uploaded notes OR the class project — for whatever OS topic those notes cover (scheduling, paging, memory management, deadlocks, etc.), and referencing the emulator project where relevant.
- **User Story:** As a student, I want AI-drafted questions in the exact formats my exam uses, drawing from my notes and my project, so I don't have to write them by hand for either.
- **Success Criteria:**
  - [ ] Can generate at least one question of each of the 4 types per Reviewer
  - [ ] Timeline/state-tracking questions include a visible table/diagram, not just prose, and aren't hardcoded to scheduling specifically
  - [ ] Code-blank questions render code with a blank and MC options, generated from whatever code appears in that Reviewer's notes OR the project code
  - [ ] At least some questions can be generated that reference the project specifically (e.g., "which part of your emulator handles X"), matching what showed up on the midterm
- **Priority:** P0

#### 3. Review & Edit Before Studying
- **What:** A screen to look over AI-generated questions, edit wording/answers, delete bad ones, or trigger a regenerate.
- **User Story:** As a student, I want to fix any AI mistakes before I quiz myself on wrong info.
- **Success Criteria:**
  - [ ] Every question is editable
  - [ ] Bad questions can be discarded without breaking the quiz set
- **Priority:** P0

#### 4. Quiz-Taking Mode
- **What:** Take the reviewed question set as a multiple-choice quiz, get a score and see which were missed.
- **User Story:** As a student, I want to test myself under the same format as the real exam.
- **Success Criteria:**
  - [ ] MC interface for all 4 question types
  - [ ] End-of-quiz score + review of missed questions
- **Priority:** P0

### Nice to Have (If Time Allows)
- **Difficulty tagging** so harder scheduling questions can be flagged separately
- **Progress tracking across multiple study sessions**

*(File upload for slides/PDF was originally listed here but was pulled up to P0 — see Feature 1 above.)*

### Stretch Goal — NOT Core MVP
- **Deploy & share with classmates**: generate a shareable link/hosted version of your review set. Only pursued if the P0 features are done with time to spare before the final.

## How We'll Know It's Working

| Metric | Target | Measure |
|--------|--------|---------|
| Question types covered | All 4 types generating correctly | Manual check across 2-3 Reviewers |
| Usable before final | App generates + quizzes at least one full Reviewer | You actually use it to study |
| (Stretch) Shared with friends | 1+ classmate uses your generated quiz | Link opened / feedback |

## Look & Feel

**Design Vibe:** Fast, no-frills, functional — speed of building matters more than polish this week.

**Key Screens:**
1. **Upload/Reviewer screen** — paste notes, name the Reviewer
2. **Review screen** — list of generated questions, edit/accept/delete
3. **Quiz screen** — one question at a time or scrollable list, MC input
4. **Results screen** — score + missed questions with note excerpts

## Technical Considerations

**Platform:** Web app (browser-based)
**Responsive:** Nice to have, not critical this week — desktop-first is fine since it's for studying
**AI Generation:** Needs an LLM call (e.g., Claude API) to turn notes into the 4 question formats — this is the core technical risk to nail down first in Technical Design
**Performance:** Not a concern at this scale (personal/small-group use)
**Security/Privacy:** Low stakes — your own notes, no sensitive data — but don't hardcode API keys client-side if it ever gets shared
**Scalability:** Not a concern for MVP; only matters if the stretch goal (share with classmates) happens

## Quality Standards

**What This App Will NOT Accept:**
- Question types outside the 4 confirmed formats (don't let AI wander into essay questions, matching, etc. — not what the exam looks like)
- Ungenerated/broken quiz questions reaching the quiz screen without a review step
- Silent AI hallucinations presented as fact — the review/edit step exists specifically to catch this

## Budget & Constraints

**Development Budget:** Minimal — free/cheap tools, personal project
**Timeline:** Final is in under a week. P0 features only. Stretch goal (sharing) is explicitly deprioritized.
**Team:** Solo, building with Claude Code

## Open Questions & Assumptions
- No real midterm copy exists yet — question style is being approximated from your description. Once you get a copy (or more detail) of the actual midterm, questions may need re-calibrating.
- Assuming multiple choice for all 4 types, including code-blank (options given, not free-typed code) — confirm this matches the real exam format.
- Timeline/state-tracking questions likely need at least a simple table/diagram renderer — flagged for Technical Design to figure out the simplest way to build this fast, generically (not scheduling-specific).
- **Full topic list for the final is not yet finalized** — will be provided when moving into Claude Code. The app's question-generation logic should stay topic-agnostic so any topic list can be dropped in later without redesigning the feature.

## Definition of Done for MVP

- [x] Can upload/paste notes into a Reviewer
- [x] AI generates all 4 question types from that content
- [x] Questions are reviewable/editable before quizzing
- [x] Quiz mode works end-to-end with scoring
- [x] You've actually used it to study with at least one Reviewer before the final

*All five closed as of 2026-08-16. See DevPhases Phase 7 for the verification pass behind the first four.*

## Next Steps

1. Create Technical Design Document (stack choice, how AI question generation actually gets built, how scheduling tables get rendered)
2. Set up project with Claude Code
3. Build P0 features only — resist scope creep given the timeline
4. Study with it
5. (Only if time remains) Add sharing/deploy for classmates

---
*Document created: 2026-08-09*
*Status: Draft — Ready for Technical Design*
