# May Reviewer

Turn your notes into a practice exam, in the question format your professor actually uses.

Live at https://mayreviewer.vercel.app

## Why I built it

I was studying for my Intro to Operating Systems final and had no copy of the midterm to practice with. I had lecture slides and my own notes, and I knew the final would look like the midterm: scenario questions, timelines like "where is process B during cycle 4?", and C++ snippets with a blank to fill in.

I started with Gemini's built-in quiz generator. It helped, but it mostly produced generic multiple choice identification questions. It couldn't do the timeline or code questions, and it had UX and QoL problems that I knew I could fix myself. So I built May Reviewer to write questions in the shape of the exam, handle the diagram and code questions, and let me review and edit every question before I studied from it. It helped me prepare for the final much better than the generic tool did.

It started as a tool for one course and has grown into a general one, with presets for other subjects. You can also make custom formats out of your uploaded notes, so the questions match whatever exam you're actually preparing for.

## What it does

- **Reviewers**: one study unit each, built from notes, slides, project material, or past exams.
- **Formats**: built-in exam formats (Operating Systems, Math, Language, Science, History), plus custom formats built from your uploaded notes.
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
