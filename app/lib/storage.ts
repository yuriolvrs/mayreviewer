import { DEFAULT_QUESTION_COUNT } from "@/app/lib/questions";
import type { Question, QuizAttempt, Reviewer } from "@/app/types";

// The ONLY file that touches localStorage. Swapping to Supabase later means
// rewriting the insides of these functions, not the components that call them.
const STORAGE_KEY = "mayreviewer-reviewers";
const ATTEMPTS_KEY = "mayreviewer-quiz-attempts";

function readJson<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

// `subject`, `topics`, `questionCount`, and `updatedAt` were added after the
// first Reviewers were already saved. Backfilling on read (rather than in each
// component) means no screen has to defend against a missing field.
function normalize(reviewer: Reviewer): Reviewer {
  return {
    ...reviewer,
    subject: reviewer.subject ?? "",
    topics: reviewer.topics ?? [],
    notes: reviewer.notes ?? "",
    projectMaterial: reviewer.projectMaterial ?? "",
    questionCount: reviewer.questionCount ?? DEFAULT_QUESTION_COUNT,
    questions: reviewer.questions ?? [],
    updatedAt: reviewer.updatedAt ?? reviewer.createdAt,
  };
}

export function getReviewers(): Reviewer[] {
  return readJson<Reviewer>(STORAGE_KEY).map(normalize);
}

export function getReviewer(id: string): Reviewer | undefined {
  return getReviewers().find((r) => r.id === id);
}

// Stamps `updatedAt` here, not in each caller, so every write path — autosave,
// generation, question edits, imports — updates it the same way and none can
// forget to.
export function saveReviewer(reviewer: Reviewer): void {
  const stamped = { ...reviewer, updatedAt: new Date().toISOString() };
  const reviewers = getReviewers();
  const index = reviewers.findIndex((r) => r.id === stamped.id);
  if (index === -1) {
    reviewers.push(stamped);
  } else {
    reviewers[index] = stamped;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reviewers));
}

// Re-reads before writing, so a caller holding a stale copy of the Reviewer
// can't revert fields it wasn't even editing. Prefer this over
// `saveReviewer({ ...reviewer, ...changes })` anywhere the component's copy
// may have gone stale (another tab autosaving, a generation finishing).
export function updateReviewer(id: string, patch: Partial<Reviewer>): Reviewer | undefined {
  const current = getReviewer(id);
  if (!current) return undefined;
  const updated = { ...current, ...patch };
  saveReviewer(updated);
  return updated;
}

export function deleteReviewer(id: string): void {
  const reviewers = getReviewers().filter((r) => r.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reviewers));
  // A deleted Reviewer's attempts would otherwise linger and reappear if its
  // id were ever reused — and the delete dialog promises the history goes too.
  deleteQuizHistory(id);
}

// Attempts live under their own key rather than on the Reviewer: they're
// append-only and unbounded, and keeping them separate means a Reviewer write
// (autosave, generation) can never race a quiz submit into overwriting one.
function getAllAttempts(): QuizAttempt[] {
  return readJson<QuizAttempt>(ATTEMPTS_KEY).map(normalizeAttempt);
}

// Attempts recorded before the results screen became reopenable kept only the
// score. They stay in history — the score is still true — but with nothing to
// reopen, which is what an empty `questions` means to the history list.
function normalizeAttempt(attempt: QuizAttempt): QuizAttempt {
  return {
    ...attempt,
    questions: attempt.questions ?? [],
    answers: attempt.answers ?? {},
    unsureIds: attempt.unsureIds ?? [],
  };
}

export function hasQuizHistory(id: string): boolean {
  return getQuizHistory(id).length > 0;
}

// Newest first — the history list reads top-down.
export function getQuizHistory(reviewerId: string): QuizAttempt[] {
  return getAllAttempts()
    .filter((a) => a.reviewerId === reviewerId)
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt));
}

// The one cross-Reviewer read in the app, backing the global /history screen.
// Newest first, same as the per-Reviewer list.
export function getAllQuizHistory(): QuizAttempt[] {
  return getAllAttempts().sort((a, b) => b.takenAt.localeCompare(a.takenAt));
}

// Scored here rather than by the caller so the stored score can never drift
// from the stored answers it's supposed to summarise.
export function saveQuizAttempt(
  reviewerId: string,
  questions: Question[],
  answers: Record<string, number>,
  unsureIds: string[],
): QuizAttempt {
  const attempt: QuizAttempt = {
    id: crypto.randomUUID(),
    reviewerId,
    takenAt: new Date().toISOString(),
    score: questions.filter((q) => answers[q.id] === q.correctIndex).length,
    total: questions.length,
    questions,
    answers,
    unsureIds,
  };
  window.localStorage.setItem(ATTEMPTS_KEY, JSON.stringify([...getAllAttempts(), attempt]));
  return attempt;
}

export function deleteQuizHistory(reviewerId: string): void {
  const remaining = getAllAttempts().filter((a) => a.reviewerId !== reviewerId);
  window.localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(remaining));
}
