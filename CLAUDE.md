# CLAUDE.md

> Source of truth for agent rules. `AGENTS.md` only references this file.

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, say how each step will be verified.

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## 5. Check Next.js Docs First

**This is NOT the Next.js you know. Don't trust training data.**

Before writing code that uses Next.js APIs or conventions (routing, `next.config`, server/client components, data fetching, middleware):
- Read the relevant guide in `node_modules/next/dist/docs/` - resolve it from this file's directory, not the repo root.
- Heed deprecation notices - don't use removed APIs or old conventions.

## 6. Keep Plan Checklists Current

**Check off work in the same change. Don't let checklists drift.**

Two checklists are tracked: `docs/DevPhases-MayReviewer-MVP.md` and `docs/ExamFormats-Plan.md`.
- Check off each `- [ ]` item as it's completed (`- [x]`).
- Do this in the same change that completes the work, not as a separate cleanup pass.
- If a phase's "Done when" criteria isn't yet met, leave its items unchecked even if code exists for them.

## 7. No AI Co-Author

**Don't claim AI as collaborator. Leave commits clean.**

- Never add an AI assistant (including Claude/Anthropic) as co-author or collaborator on commits.
- No `Co-Authored-By` trailer, no mention in commit messages or PR descriptions.

## 8. No Commits or Pushes Without Permission

**Don't commit, push, or open PRs unless asked. Staging counts too.**

- Never commit, amend, push, or open a pull request unless explicitly asked.
- Staging is also off limits without permission.
- Prepare the change, show the diff and status, then wait. A request to "track" or "save" files is not a request to commit them.

## 9. Model Workflow

**Opus plans and reviews. Sonnet writes code.**

Commands: `npm run build` · `npm run lint` · `npm run test` (vitest) · `npm run test:e2e` (playwright) · `npx tsc --noEmit`

- Main session (Opus) plans, writes specs, reviews, and updates docs. The `implementer` agent (Sonnet) writes code.
- Size rule: a change that touches 3 files or fewer and is under about 50 lines is done directly by the main session. Otherwise, use the loop.
- Loop:
  1. Write each task spec so it stands alone, and pass it inline in the `implementer` prompt. Don't create plan files.
  2. Delegate the task to `implementer`.
  3. Review the diff against the spec and `docs/DECISIONS.md`.
  4. Send findings back to the same implementer with SendMessage. Repeat until clean.
  5. Record decisions in `docs/DECISIONS.md` and tick the task.
- The main session writes no production code outside the size rule, except small fixes found during review.
- Run tasks in parallel only if they touch different files.
- To read a single known file, read it directly. Do not spawn an agent.
