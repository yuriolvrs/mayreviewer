# May Reviewer

Turn your notes into a practice exam that matches your professor's question format.

## What it does

- **Reviewers** — one study unit each: notes, project material, past exams, generated questions.
- **Formats** — built-in exam formats (CSOPESY Final, Math, Language, Science, History) plus your own custom formats with an inference helper that drafts types from a past exam.
- **Quiz** — immediate or end-only feedback, scope by type, retakes with reshuffled options.
- **History** — every attempt across all reviewers, reopenable.
- **Import/Export** — reviewers travel as `.json`, or as `.zip` with uploaded files bundled.

Everything is stored in your browser (`localStorage` + IndexedDB). No accounts, no server-side data.

## Run it

```bash
npm install
npm run dev
```

Create `.env.local` with `GEMINI_API_KEY` (required) and `MISTRAL_API_KEY` (optional fallback for generation).

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command          | What it does                        |
| ---------------- | ----------------------------------- |
| `npm run dev`    | Start the dev server                |
| `npm run build`  | Production build                    |
| `npm run lint`   | Lint `app`, `e2e`, and `tests`      |
| `npm run test`   | Unit tests (vitest)                 |
| `npm run test:e2e` | End-to-end tests (playwright)     |

`npx tsc --noEmit` typechecks. Coverage: `npx vitest run --coverage`.

## Limits (also listed in About)

- Uploads: PDF/JPG/PNG/WebP as files; DOCX/TXT/CPP read as text. Up to 10 files per request, 15 MB each, 40 MB total. No HEIC.
- Generation: 8 runs / 10 min. Format inference: 8 / 10 min (separate bucket). Upload tokens: 30 / 10 min.
- Imports: 25 MB file cap, 40 MB expanded zip cap.
