import type { QuizAttempt, Reviewer } from "@/app/types";

// The ONLY file that touches localStorage. Swapping to Supabase later means
// rewriting the insides of these functions, not the components that call them.
const STORAGE_KEY = "mayreviewer-reviewers";
const ATTEMPTS_KEY = "mayreviewer-quiz-attempts";

export const DEFAULT_QUESTION_COUNT = 10;

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

// `subject`, `topics`, and `questionCount` were added after the first Reviewers
// were already saved. Backfilling on read (rather than in each component) means
// no screen has to defend against a missing field.
function normalize(reviewer: Reviewer): Reviewer {
  return {
    ...reviewer,
    subject: reviewer.subject ?? "",
    topics: reviewer.topics ?? [],
    notes: reviewer.notes ?? "",
    projectMaterial: reviewer.projectMaterial ?? "",
    questionCount: reviewer.questionCount ?? DEFAULT_QUESTION_COUNT,
    questions: reviewer.questions ?? [],
  };
}

export function getReviewers(): Reviewer[] {
  return readJson<Reviewer>(STORAGE_KEY).map(normalize);
}

export function getReviewer(id: string): Reviewer | undefined {
  return getReviewers().find((r) => r.id === id);
}

export function saveReviewer(reviewer: Reviewer): void {
  const reviewers = getReviewers();
  const index = reviewers.findIndex((r) => r.id === reviewer.id);
  if (index === -1) {
    reviewers.push(reviewer);
  } else {
    reviewers[index] = reviewer;
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
  return readJson<QuizAttempt>(ATTEMPTS_KEY);
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

export function saveQuizAttempt(reviewerId: string, score: number, total: number): QuizAttempt {
  const attempt: QuizAttempt = {
    id: crypto.randomUUID(),
    reviewerId,
    takenAt: new Date().toISOString(),
    score,
    total,
  };
  window.localStorage.setItem(ATTEMPTS_KEY, JSON.stringify([...getAllAttempts(), attempt]));
  return attempt;
}

export function deleteQuizHistory(reviewerId: string): void {
  const remaining = getAllAttempts().filter((a) => a.reviewerId !== reviewerId);
  window.localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(remaining));
}
