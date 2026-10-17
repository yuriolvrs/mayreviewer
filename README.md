# May Reviewer

Turn your notes into a practice exam, in the question format your professor actually uses.

## Why I built it

I was studying for my Intro to Operating Systems final and had no copy of the midterm to practice with. I had lecture slides and my own notes, and I knew the final would look like the midterm: scenario questions, timelines like "where is process B during cycle 4?", and C++ snippets with a blank to fill in.

Flashcard and quiz apps don't really do that. They make generic recall questions, so I was writing practice questions by hand, and the diagram and code ones took forever.

May Reviewer takes the material a student already has and writes questions in the shape of their exam. Every generated question can be reviewed and edited before you study from it, because AI gets things wrong and I didn't want anyone trusting it blindly. It started as a tool for one course and has grown into a general one, with presets for other subjects and custom formats you can infer from a past exam.

## What it does

- **Reviewers**: one study unit each, built from notes, slides, project material, or past exams.
- **Formats**: built-in exam formats, plus presets and custom formats.
- **Quizzes**: immediate or end-of-quiz feedback, retakes, and a history of every attempt.
- **Import and export**: reviewers can move between browsers as `.json` or `.zip`.

There is no account wall. The core loop works signed out and offline, and your data stays in the browser. Signing in is optional and syncs across devices.

## Running it locally

```bash
npm install
npm run dev
```

Create a `.env.local` with `GEMINI_API_KEY` (required) and `MISTRAL_API_KEY` (optional fallback for generation), then open [http://localhost:3000](http://localhost:3000).

Other useful commands: `npm run build`, `npm run test` (Vitest), and `npm run test:e2e` (Playwright).
