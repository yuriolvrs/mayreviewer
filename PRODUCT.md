# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Mobile web first-class. An Android build is planned as a Trusted Web Activity wrapping the live site, so the design language stays web, not native Android.)

## Users

Filipino college students, any course. They study for exams from their own lecture notes, slides, and past exams, often on a phone, often close to the exam date. The job: turn the material they already have into practice that looks like the real exam, then drill it.

The product started with one student preparing for an Operating Systems final and grew to general courses.

## Product Purpose

Turn your notes into a practice exam, in a question format you choose. Success: a student uploads material, gets questions in the formats their exam actually uses, reviews them, and studies from them daily.

## Positioning

Generic flashcard and quiz tools produce generic questions. May Reviewer generates questions in the *format* of the student's actual exam: built-in formats (identification, scenario, timeline/state-tracking, code fill-in-the-blank, modified true/false; Math, Language, Science, History presets) plus custom formats inferred from a past exam. Students review and edit every question before trusting it.

## Operating Context

- Material in: pasted text, PDF, DOCX, TXT, images, code files; notes, project material, and past exams per reviewer.
- Study loop: take quizzes (immediate or end-only feedback, optional timer), daily goal, streaks with restores, milestones, history.
- Works without an account. Data lives in the browser (localStorage + IndexedDB). Optional account (Supabase, email or Google) syncs across devices.
- Offline: reading reviewers and taking quizzes work offline; generation needs a connection.

## Capabilities and Constraints

- Free to use. All AI generation is free for students; no paid tier exists. A `proTier` flag is reserved but gates nothing. Ads vs paid Pro is undecided.
- AI providers: Gemini, with Mistral as fallback. Generated questions can be wrong; the app says so.
- English UI. Tagalog may come later.
- Deployed at https://mayreviewer.vercel.app (Next.js on Vercel).

## Brand Commitments

- Header/logo text, exact casing: "pre, May Reviewer ka ba?" (Taglish: roughly "bro, got a reviewer?"). "Reviewer" is the Filipino student word for a study guide.
- Tagline: "Turn your notes into a practice exam, in a question format you choose."
- Existing design spec: `May Reviewer Design Spec/design_handoff_may_reviewer/Design-Spec.md` (tokens in `app/globals.css`).

## Evidence on Hand

- No testimonials, user counts, ratings, or press. Do not fabricate any.
- Real screenshots of the app can be captured from the running product.

## Product Principles

1. The exam's format is the product: match how the professor asks, not generic recall.
2. The student stays in control: every AI question is reviewable and editable.
3. No account wall: the core loop works signed out and offline.
4. Honest about AI: never overstate accuracy.
5. Built for the phone in a student's hand the week before the exam.
