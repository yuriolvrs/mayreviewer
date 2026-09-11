<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Guidelines for AI coding agents

Behavioral guardrails to reduce common mistakes. They bias toward caution
over speed — use judgment for trivial tasks.

## 1. Think before coding

Do not assume. Do not hide confusion. Surface tradeoffs.

Before implementing:
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — do not pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what is confusing. Ask.

## 2. Simplicity first

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that was not requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask: "Would a senior engineer call this overcomplicated?" If yes, simplify.

## 3. Surgical changes

Touch only what you must. Clean up only your own mess.

When editing existing code:
- Do not "improve" adjacent code, comments, or formatting.
- Do not refactor things that are not broken.
- Match existing style, even if you would do it differently.
- If you notice unrelated dead code, mention it — do not delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Do not remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the request.

## 4. Goal-driven execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan with a verification step per step.

## 5. Keep the plan checklists current

Two checklists are tracked: `docs/DevPhases-MayReviewer-MVP.md` (the finished
MVP build) and `docs/ExamStyles-Plan.md` (the live exam-styles build). As
development proceeds:
- Check off each `- [ ]` item as it is completed (`- [x]`).
- Do this in the same change that completes the work, not as cleanup later.
- If a phase's "Done when" criteria is not yet met, leave its items unchecked
  even if code exists for them.

## 6. No AI co-author

Never add an AI assistant as co-author or collaborator on commits (no
`Co-Authored-By` trailer, no mention in commit messages or PR descriptions).

## 7. No commits or pushes without permission

Never commit, amend, push, or open a pull request unless explicitly asked.
Staging is also off limits without permission. Prepare the change, show the
diff and status, then wait. A request to "track" or "save" files is not a
request to commit them.

## 8. Writing style — blended simplified technical English

Write about half of your prose in ASD-STE100 simplified technical English.
This applies mainly to chat replies: short sentences, active voice, one idea
per sentence, plain words instead of jargon, no idioms or metaphors. Use the
same style in code comments, commit messages, and UI copy where it fits.
Blend it rather than applying it everywhere — keep enough ordinary prose
that reasoning, trade-offs, and nuance still read naturally.
