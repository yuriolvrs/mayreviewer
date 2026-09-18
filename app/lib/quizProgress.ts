import type { FeedbackMode, Question } from "@/app/types";
import type { Answers } from "@/app/components/QuizTaking";

// In-progress quiz snapshot, so a refresh mid-quiz restores the taking
// screen instead of dropping back to setup. Stored per reviewer under one
// key (a Record keyed by reviewer id) — same seam pattern as settings.ts,
// so a future Supabase swap rewrites this file, not the components.
export type QuizProgress = {
  reviewerId: string;
  quizQuestions: Question[];
  answers: Answers;
  unsureIds: string[];
  // Persisted too: without it a refresh would unlock locked immediate-mode
  // answers and let the reader change them after seeing feedback.
  confirmedIds: string[];
  timeLimitSec: number | null;
  // Date.now() epoch ms from when the attempt started. The countdown derives
  // from wall-clock elapsed (now - startedAt), so restoring this keeps the
  // timer accurate across reloads — time spent away still counts.
  startedAt: number;
  formatId: string | null;
  feedbackMode: FeedbackMode;
  savedAt: number;
};

export const PROGRESS_KEY = "mayreviewer-quiz-in-progress";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isAnswers(value: unknown): value is Answers {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(
    (v) => typeof v === "number" && Number.isInteger(v) && v >= 0,
  );
}

function isQuestionArray(value: unknown): value is Question[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (q) =>
        typeof q === "object" &&
        q !== null &&
        typeof (q as { id?: unknown }).id === "string" &&
        Array.isArray((q as { options?: unknown }).options),
    )
  );
}

function isProgress(value: unknown): value is QuizProgress {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.reviewerId === "string" &&
    isQuestionArray(v.quizQuestions) &&
    isAnswers(v.answers) &&
    isStringArray(v.unsureIds) &&
    (v.confirmedIds === undefined || isStringArray(v.confirmedIds)) &&
    (v.timeLimitSec === null ||
      (typeof v.timeLimitSec === "number" && Number.isFinite(v.timeLimitSec) && v.timeLimitSec > 0)) &&
    typeof v.startedAt === "number" &&
    Number.isFinite(v.startedAt) &&
    v.startedAt > 0 &&
    (v.formatId === null || typeof v.formatId === "string") &&
    (v.feedbackMode === "immediate" || v.feedbackMode === "end-only")
  );
}

function readAll(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(PROGRESS_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    // Corrupt progress must never block the quiz — setup stays reachable.
    return {};
  }
}

export function getQuizProgress(reviewerId: string): QuizProgress | null {
  const raw = readAll()[reviewerId];
  if (!isProgress(raw)) return null;
  if (raw.reviewerId !== reviewerId) return null;
  return { ...raw, confirmedIds: raw.confirmedIds ?? [] };
}

export function saveQuizProgress(progress: QuizProgress): void {
  if (typeof window === "undefined") return;
  const all = readAll();
  all[progress.reviewerId] = { ...progress, savedAt: Date.now() };
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  } catch {
    // Progress is best-effort: a full store must never break answering.
  }
}

export function clearQuizProgress(reviewerId: string): void {
  if (typeof window === "undefined") return;
  const all = readAll();
  if (!(reviewerId in all)) return;
  delete all[reviewerId];
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  } catch {
    // Best-effort (see saveQuizProgress).
  }
}
