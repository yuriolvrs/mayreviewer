# Technical Design Document: "May Reviewer" MVP

## How We'll Build It

### Recommended Approach: Next.js app (localStorage for now) + in-app Gemini API generation

Given free-only budget, a sub-week timeline, and wanting an easy path to add Supabase + Vercel later, the fastest path that still sets up cleanly for that future is: **Next.js from day one, but keep data in `localStorage` for the MVP** — no database, no auth. This avoids doing throwaway work now while making the eventual Supabase swap a contained, later change instead of a rewrite.

**Primary Recommendation: Next.js (App Router) + `localStorage` for data + in-app question generation via the Gemini API (free tier)**

- **Why it's perfect for you:**
  - Next.js deploys to Vercel with zero config — when you're ready to share with classmates, it's a git push, not a migration
  - Adding Supabase later is a natural fit: swap `localStorage` calls for Supabase client calls inside the same data functions, without touching your UI components
  - **Zero API cost for question generation:** Gemini's free tier (via Google AI Studio) has no billing requirement — unlike the Claude API, which has no meaningful free tier
  - Gemini supports **schema-constrained JSON output** (`responseSchema`) — the API is constrained to return valid JSON matching our exact `Question` shape, which removes the "AI wrapped the JSON in extra prose" failure mode that a manual copy-paste-to-Claude.ai loop would have needed a parser fallback for
  - Since you've used Claude Code before, Next.js's conventions (file-based routing, `app/` directory) are well-documented and something Claude Code knows very well — it won't slow you down
- **What it costs:** $0 — Vercel's free tier covers hosting; Gemini's free tier (rate-limited, not usage-billed) covers generation
- **Time to build:** slightly more than a pure copy-paste loop (one server-side API route + a `GEMINI_API_KEY`), but removes an entire manual UI flow (Build Prompt / copy / paste-response / parse-error-handling), so it's a wash
- **Limitations to know:** Free-tier Gemini has rate limits (requests per minute/day) — fine for solo/small-group study use, but not designed for high volume. Next.js does add a small build-tooling layer (npm, a dev server) that plain HTML/JS wouldn't have, but Claude Code handles that setup for you.

### Alternative Options Compared

| Option | Pros | Cons | Cost | Time to MVP |
|--------|------|------|------|-------------|
| **Next.js + localStorage + in-app Gemini API (recommended)** | Clean path to Vercel + Supabase later, no rewrite needed, $0, no manual copy-paste UI, schema-guaranteed JSON | Requires a `GEMINI_API_KEY` + one server-side API route | $0 (free tier) | 1-2 days |
| Manual copy-paste to Claude.ai | No API key at all | Extra manual UI (Build Prompt/paste/parse), no schema guarantee, prose-wrapped JSON risk | $0 | 1-2 days |
| Plain HTML/CSS/JS + localStorage | Fastest possible to build, zero tooling | Migrating to Next.js/Supabase later means a rewrite, not an upgrade; no clean way to hide an API key server-side | $0 | 1 day |
| Next.js + Supabase from day one | Fully "future-proof" immediately | Adds auth/database setup work this week you don't need yet, more surface area for bugs under time pressure | $0 (free tier) | 3-4 days |
| Direct Claude API integration | Automated generation | Claude API has no meaningful free tier — real per-call cost | $/mo | +1-2 days on top of any stack above |

Given the timeline, **Next.js + localStorage + in-app Gemini API is the sweet spot**: automated generation, no manual copy-paste step, still $0, and schema-constrained output makes the riskiest part of the app (reliable JSON) more robust than the copy-paste alternative would have been. Supabase is still an explicit fast-follow, not part of this build.

## Project Setup Checklist

### Step 1: Accounts (Day 1)
- [ ] GitHub account (you likely have this already) — for Claude Code + Vercel deploy
- [ ] Vercel account (free) — connects directly to GitHub, no credit card needed for free tier
- [ ] Google AI Studio account (free) — for a `GEMINI_API_KEY`, no credit card needed for the free tier
- [ ] Nothing else needed yet — no Supabase account required (localStorage handles storage for MVP)

### Step 2: AI Assistant Setup (Day 1)
- [ ] Open Claude Code in your project folder
- [ ] Confirm it can read this TDD + the PRD as context before building

### Step 3: Project Initialization
```bash
npx create-next-app@latest mayreviewer
# When prompted: TypeScript = your choice (optional, not required for this scope),
# App Router = yes, Tailwind = optional but recommended for fast styling
cd mayreviewer
git init
```

Let Claude Code scaffold from here — a single `app/page.tsx` (or `.jsx`) plus a few components is enough for this scope. No database ORM, no auth library. One API route is needed: `app/api/generate/route.ts`, which calls the Gemini API server-side so `GEMINI_API_KEY` is never exposed to the client. Storage itself stays client-side (`localStorage`).

## Building Your Features

### Feature 1: Notes & Project Material Upload

**Complexity:** Easy

- **Key Components Needed:**
  - A `<ContentField>` component (used for both Notes and Project Material): a two-mode control — **Upload files** (default) or **Paste text**. Upload mode accepts multiple PDF/DOCX/TXT files via drag-drop or a file picker. **PDFs are NOT text-extracted** — they're kept as raw PDF files and sent to Gemini as-is at generation time, since Gemini has native PDF vision (it reads embedded text, diagrams, charts, and images directly — up to 1000 pages — rather than only OCR'd text). DOCX/TXT don't get that treatment from Gemini (non-PDF documents are flattened to plain text, losing layout/images), so those are still text-extracted client-side (`mammoth` for DOCX, `File.text()` for TXT) and concatenated (with a `--- filename ---` header) into the field's saved text value. **Revision history:** originally scoped as paste-only with file upload as a stretch goal; then briefly text-extracted PDFs too via `pdfjs-dist` before landing here — PDFs turned out to be the primary expected upload (often with diagrams/images that matter for question generation), multi-file the default case, and text-flattening was actively throwing away what Gemini can use natively. See PRD/DevPhases.
  - A separate `<ContentField>` for uploaded material — spec text/code and/or PDFs, kept visually distinct from lecture notes since questions may reference either
  - A "Reviewer name" input so multiple Reviewers don't overwrite each other
- **Data/Backend Needs:**
  - **What to store in `localStorage`:** reviewer name, subject, topics, notes text (DOCX/TXT/paste only), project-material text (same), questions, timestamp — accessed through `lib/storage.ts` as before.
  - **What to store in IndexedDB, separately:** raw PDF attachments (`app/lib/attachments.ts`, using the `idb` package). PDF bytes are far bigger than `localStorage`'s ~5-10MB quota allows for, especially with many files per Reviewer, so they live in their own IndexedDB database (`mayreviewer-attachments`), keyed by Reviewer ID + field (`notes`/`project`). **PDF attachments are deliberately NOT part of the `Reviewer` type and NOT included in Export/Import JSON** — they're local-only, per explicit decision (Export/Import only needs to carry Reviewer details + questions, not uploaded files). Deleting a Reviewer must also call `deleteAttachmentsForReviewer(id)` to avoid orphaned IndexedDB entries.
  - **`localStorage` structure (unchanged shape, just notes/projectMaterial no longer contain PDF text):**
    ```js
    // localStorage key: "mayreviewer-reviewers"
    [
      {
        id: "uuid",
        reviewerName: "CPU Scheduling",
        subject: "...",
        topics: ["..."],
        notes: "...", // DOCX/TXT/paste text only, no PDF content
        projectMaterial: "...", // optional, same rule
        questions: [],
        createdAt: "2026-08-09"
      }
    ]
    ```
  - **IndexedDB structure:**
    ```ts
    // "mayreviewer-attachments" DB, "attachments" object store, keyPath "id", indexed by "reviewerId"
    {
      id: "uuid",
      reviewerId: "uuid",
      field: "notes" | "project",
      name: "lecture12.pdf",
      mimeType: "application/pdf",
      data: ArrayBuffer,
      addedAt: "2026-08-09T...",
    }
    ```
  - **Gotcha (already hit once):** `idb`'s `openDB()` must be called lazily (on first actual use), not at module load time — this module gets imported into a page that's server-rendered first, and `indexedDB` doesn't exist during SSR. Calling it eagerly at the top of the module throws `ReferenceError: indexedDB is not defined`.

### Feature 1b: Export/Import JSON (build right after Feature 1)

**Complexity:** Easy — and disproportionately valuable for how little code it takes

- **What:** A button to download a full Reviewer (info + notes + project material text + questions) as a `.json` file, and a button to upload/import one back in. **Uploaded PDF attachments are explicitly excluded** — they live in IndexedDB only, not in the `Reviewer` object this feature exports/imports.
- **Why now, not later:** Since the AI-generated quiz format *is* JSON (see Feature 2), export is just `JSON.stringify()` + file download, and import is `JSON.parse()` + merge into `localStorage` — there's no extra format to design. This single feature covers three needs at once without deployment or a database:
  - **Backup** against browser data loss
  - **Sharing** with classmates (send the file, they import it)
  - **A ready-made path into Supabase later** — importing a JSON export becomes the same code as any other import, not a special one-off migration
- **Success Criteria:**
  - [ ] Export produces a valid `.json` file matching the `Reviewer`/`Question` types
  - [ ] Import reads that file back in and merges it without duplicating or corrupting existing Reviewers

### Feature 2: AI Question Generation (In-App Gemini API)

**Complexity:** Medium (the prompt + schema design is the trickiest part of this whole app — worth getting right)

- **How it works:**
  1. App has a fixed **prompt template** baked in (see below) that describes the 4 question formats
  2. When you click **Generate Questions**, the client reads this Reviewer's PDF attachments from IndexedDB (`getAttachments(reviewerId)`) and sends them, along with the Reviewer's notes + project material text (+ subject/topics if set), to `POST /api/generate`
  3. The API route (`app/api/generate/route.ts`) uploads each PDF to **Gemini's File API** server-side first (not inline base64 — inline requests cap around 20MB total, which multiple PDFs can exceed; the File API supports files up to 2GB each, retained 48h), then calls `generateContent` with a mix of `file_uri` parts (the PDFs — Gemini reads their text, diagrams, and images natively) and text parts (the filled prompt template + notes/project-material text), using a `responseSchema` that constrains the output to the exact `Question[]` shape — no prose wrapper, no manual parsing of stray text
  4. The route returns the parsed question objects (or a clear error) to the client, which appends them to the Reviewer's question pool

- **Prompt template (bake this into the API route as a JS string):**
  ```
  Generate practice exam questions for an Intro to Operating Systems final.
  The exam format includes these 4 question types — generate a mix of all 4:

  1. IDENTIFICATION: Describe a term/concept, give 4 MC options, one correct.
  2. SCENARIO: Describe a situation, ask which OS concept/component it illustrates, 4 MC options.
  3. TIMELINE/STATE: Given a process or state changing over steps/time (e.g. scheduling,
     page faults, process lifecycle), ask about state at a specific point, with a table/diagram
     of the sequence included in the question text. 4 MC options.
  4. CODE FILL-IN-BLANK: A short C++ snippet with one blank marked ____, 4 MC options for
     what goes in the blank (variable name, function name, or keyword).

  Base questions on this material:
  ---NOTES---
  {{notes}}
  ---PROJECT MATERIAL (if relevant, reference this OS emulator project in some questions)---
  {{projectMaterial}}
  ---END---
  ```
- **Gemini `responseSchema` (attach to the API request, not just described in the prompt):**
  ```ts
  {
    type: "array",
    items: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["identification", "scenario", "timeline", "code"] },
        question: { type: "string" }, // any table/diagram/code as plain text/markdown inside this string
        options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
        correctIndex: { type: "integer" },
        source: { type: "string", enum: ["notes", "project"] },
      },
      required: ["type", "question", "options", "correctIndex", "source"],
    },
  }
  ```
- **Why schema-constrained output matters:** unlike a manual copy-paste-to-Claude.ai loop (which relies on the model *choosing* to follow a "return only JSON" instruction), Gemini's `responseSchema` mode structurally constrains generation to match the schema — this removes almost all of the "AI wrapped the JSON in extra prose" failure mode. Still wrap the API call and any residual parsing in a try/catch with a clear error message and no data loss on failure — free-tier rate limits or a network blip are real failure modes even if malformed JSON mostly isn't.
- **Success Criteria:**
  - [ ] Generate button calls `/api/generate` with notes + uploaded material and shows a loading state
  - [ ] Response reliably parses into question objects (schema-constrained); a request failure (rate limit/network) shows a clear error and doesn't lose the Reviewer's existing content
  - [ ] Returned questions get added to that Reviewer's question pool in localStorage

### Feature 3: Review & Edit

**Complexity:** Easy

- List all generated questions for a topic, each editable inline (question text, options, correct answer) and deletable
- **Data:** update the same localStorage question objects in place

### Feature 4: Quiz Mode

**Complexity:** Easy-Medium

- Pull the reviewed question pool for a topic, present one at a time (or scrollable), radio-button style MC input
- On submit: score + list of missed questions with the question text shown again (source notes/project excerpt if you want extra polish, but not required for P0)
- **Data:** quiz attempts don't need to persist for MVP — score display is enough

## Design Implementation

**Update:** the original "fast, no-frills" plain-CSS approach below has been superseded by a high-fidelity design spec (`May Reviewer Design Spec/design_handoff_may_reviewer/Design-Spec.md`, gitignored, kept locally as a reference bundle) — exact color tokens, type scale, spacing, radius, and per-question-type component treatments. Implement against that spec using Tailwind utility classes. Where the design spec's screen *structure* or *behavior* conflicts with this TDD/AppFlow (e.g. it assumed manual generation was automatic, which is now resolved above; it omitted the Source filter/badge and the scrollable+side-panel quiz layout that AppFlow requires), this TDD/AppFlow's structure and behavior win — only visual styling (tokens, typography, spacing, component look) is taken from the design spec as-is.

- Font stack: Libre Franklin (UI/headings), Space Mono (code) — per Design-Spec §0/§1
- Tailwind utility classes throughout, no separate component library
- Desktop-first per PRD; design spec's responsive floor is ~1280px (no need to support narrower for P0)

## Database & Data Storage

**Storage for MVP: `localStorage` only, wrapped in a single helper module — no database, no backend yet**

This is the single biggest reason this build stays fast this week: there is no server to write, no auth to build, no database to provision. Since it's just you (with sharing as an explicit stretch goal, not P0), everything lives in the browser for now — but structured so swapping in Supabase later is a contained change.

**Project structure:**
```
app/
├── page.tsx              # Main app shell / routing between views
├── api/
│   └── generate/
│       └── route.ts       # Server-side Gemini call; reads GEMINI_API_KEY, applies responseSchema
├── components/
│   ├── ReviewerForm.tsx      # Upload notes + uploaded material
│   ├── GenerateButton.tsx # Calls /api/generate, handles loading/error state
│   ├── ReviewList.tsx     # Edit/delete questions
│   └── Quiz.tsx           # Quiz-taking + scoring
├── lib/
│   ├── storage.ts         # ALL localStorage read/write goes through here (Reviewer/Question data)
│   ├── attachments.ts     # ALL IndexedDB read/write goes through here (raw PDF attachments only)
│   └── extractText.ts     # DOCX/TXT → plain text (PDF is NOT extracted — see Feature 1)
└── types/
    └── index.ts            # Reviewer, Question types shared across components
```

```ts
// types/index.ts
type Question = {
  id: string;
  type: "identification" | "scenario" | "timeline" | "code";
  question: string;
  options: string[];
  correctIndex: number;
  source: "notes" | "project";
};

type Reviewer = {
  id: string;
  reviewerName: string;
  subject: string;
  topics: string[];
  notes: string; // DOCX/TXT/paste text only — PDF attachments live in IndexedDB, not here
  projectMaterial: string; // same rule
  questions: Question[];
  createdAt: string;
};
```

```ts
// lib/storage.ts — the ONLY file that touches localStorage
export function getReviewers(): Reviewer[] { /* read + parse localStorage */ }
export function saveReviewer(reviewer: Reviewer): void { /* write to localStorage */ }
export function deleteReviewer(id: string): void { /* remove from localStorage */ }
```

**Why route everything through `lib/storage.ts`:** when you're ready for Supabase, you rewrite the *inside* of these three functions to call the Supabase client instead of `localStorage` — the components calling `getReviewers()`/`saveReviewer()` never need to change. That's the whole point of choosing Next.js now: this file is the seam where the future upgrade happens.

**Trade-off to acknowledge (true until you add Supabase):** `localStorage` is per-browser, per-device. If you switch computers or clear browser data, your question sets are gone. Worth adding a simple **Export/Import JSON** feature early (low effort, high value) — it doubles as your backup mechanism now and the sharing mechanism for the stretch goal before Supabase exists.

### Migration Path to Supabase (Later, Not This Week)

When you're ready to move past solo/local use:
1. Create a Supabase project (free tier), add `reviewers` and `questions` tables mirroring the `Reviewer`/`Question` types above
2. Rewrite the three functions in `lib/storage.ts` to call `supabase.from('reviewers')...` instead of `localStorage`
3. Add Supabase Auth if you want per-user accounts (needed once classmates are creating their own Reviewers, not just consuming yours)
4. Deploy to Vercel with Supabase env vars — this is also when the "share with classmates" stretch goal becomes a real multi-user feature instead of an Export/Import file

None of this needs to happen before your final — it's here so the app doesn't need to be rebuilt from scratch when you do get to it.

## AI Assistance Strategy

| Task | Best AI Tool | Example Prompt |
|------|-------------|-----------------|
| Building the app | Claude Code | "Read PRD + TDD, build Feature 1 (upload/Reviewer storage) first, then Feature 2 (/api/generate route)" |
| Generating actual quiz questions | Gemini API (in-app, automatic) | Triggered by the Generate button — no manual prompting needed |
| Debugging | Claude Code | Paste error + relevant file, ask for a fix |

**Suggested build order for Claude Code**, given the timeline:
1. Feature 1 (upload + localStorage) — proves the storage layer works
2. **Export/Import JSON** — moved up because it's small, and since JSON is already both the generation format and the storage format, it's nearly free to build here. It gives you backup, sharing, and a DB-import path later, without needing deployment — worth having early rather than as an afterthought.
3. Feature 2's `/api/generate` route (prompt template + Gemini call + schema) — this is the riskiest part, budget extra time for API/rate-limit edge cases
4. Feature 2's client side (Generate button, loading/error states)
5. Feature 3 (review/edit)
6. Feature 4 (quiz mode)

## Deployment Plan

Not required for P0 (you can just run `npm run dev` locally to study) — but since it's Next.js, deploying to Vercel is genuinely trivial if you want it live before the final:

- **Platform:** Vercel (free tier, made by the Next.js team — zero-config for this stack)
- **Steps:** push repo to GitHub → import into Vercel → deploy → add `GEMINI_API_KEY` as a Vercel environment variable (Project Settings → Environment Variables), same value as your local `.env.local`.
- This is also exactly the deployment path the stretch goal (sharing with classmates) will reuse — no separate setup later.

## Cost Breakdown

| Service | Cost | Notes |
|---------|------|-------|
| Claude Code | Your existing usage | No extra cost for this project specifically |
| Gemini API (question generation) | Free tier | Rate-limited, not usage-billed — no card required |
| Vercel hosting | Free | Free tier is generous for this scale, no card required |
| Supabase (future, not this week) | Free tier when added | Not part of MVP cost, listed so you know it stays $0 later too |
| **Total** | **$0** | Matches your free-only budget |

## Important Limitations

1. **Gemini free tier is rate-limited:** requests per minute/day caps apply. *Workaround:* fine for solo/small-group study use; if it ever becomes a bottleneck, the fix is a paid tier bump on the same integration, not a rewrite.
2. **localStorage is single-browser:** No cross-device sync, no real multi-user sharing without the Export/Import step. *Workaround:* Export/Import JSON, or the stretch-goal deploy if you want classmates to use it live.
3. **API key must stay server-side:** `GEMINI_API_KEY` must only ever be read inside `app/api/generate/route.ts` (a server component/route), never in a client component or committed to git. *Workaround:* `.env.local` is already gitignored; double-check before any commit that touches `.env*`.

## Success Checklist

### Before Starting Development
- [ ] PRD and this TDD both saved in your project folder for Claude Code to read
- [ ] `GEMINI_API_KEY` obtained from Google AI Studio and saved in `.env.local`

### During Development
- [ ] Build in the order above — don't let Claude Code jump to quiz mode before storage/generation work
- [ ] Test `/api/generate` against a real Reviewer's notes early, not last

### Before Using It to Study
- [ ] Can create a Reviewer, enter notes + uploaded material, click Generate, and get real questions back automatically
- [ ] Can edit/delete a bad question
- [ ] Can take a quiz and see a score

## Definition of Technical Success

- Runs entirely in the browser except the one server-side generation call, no server to babysit
- You can generate real OS questions from real notes with one click, no manual copy-paste, no bill
- Review step catches AI mistakes before they reach the quiz
- Total cost: $0

---
*Technical Design for: "May Reviewer" (header text: "pre, May Reviewer ka ba?")*
*Approach: Next.js (App Router) + localStorage + in-app Gemini API generation (schema-constrained) — structured for a later Supabase/Vercel upgrade*
*Estimated Time to MVP: 1-2 days*
*Estimated Cost: $0/month*
