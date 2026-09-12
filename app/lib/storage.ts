import { DEFAULT_QUESTION_COUNT, splitCountEvenly, sumCounts } from "@/app/lib/questions";
import { CSOPESY_FINAL, formatTypeKeys, resolveFormat } from "@/app/lib/examFormats";
import { newId } from "@/app/lib/ids";
import type { Question, QuizAttempt, Reviewer } from "@/app/types";

// The ONLY file that touches localStorage. Swapping to Supabase later means
// rewriting the insides of these functions, not the components that call them.
const STORAGE_KEY = "mayreviewer-reviewers";
const ATTEMPTS_KEY = "mayreviewer-quiz-attempts";

// Shared by every attempt saved before `questionSetGeneratedAt` existed, so
// they collapse into one legacy group instead of each looking like its own
// set (real values are ISO timestamps, so this never collides with one).
const LEGACY_QUESTION_SET = "legacy";

function readJson<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("not an array");
    corruptKeys.delete(key);
    return parsed as T[];
  } catch {
    // One bad byte must never silently wipe the store: stash the raw value
    // under a backup key and mark this key corrupt so writers refuse to
    // overwrite it until the user recovers or clears it.
    corruptKeys.add(key);
    try {
      window.localStorage.setItem(`${key}-corrupt-${Date.now()}`, raw);
    } catch {
      // Backup is best-effort; the corrupt flag above still blocks writes.
    }
    return [];
  }
}

// Keys whose stored JSON failed to parse since load. Writers check this to
// avoid overwriting corrupt data with a fresh single-entry array.
const corruptKeys = new Set<string>();

export function isStorageCorrupt(key: string = STORAGE_KEY): boolean {
  return corruptKeys.has(key);
}

// Clears the corrupt flag after the user recovers or discards the backup.
// Also used by tests to reset module state between cases.
export function dismissStorageCorruption(key: string = STORAGE_KEY): void {
  corruptKeys.delete(key);
}

export function storageCorruptionBackupKeys(key: string = STORAGE_KEY): string[] {  if (typeof window === "undefined") return [];
  const found: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k?.startsWith(`${key}-corrupt-`)) found.push(k);
  }
  return found;
}

function assertNotCorrupt(key: string): void {
  if (corruptKeys.has(key)) {
    throw new Error(
      "Stored data looks corrupt — a backup was kept and nothing was overwritten. Export what you can, then clear the corrupt key to continue.",
    );
  }
}

function writeJson(key: string, value: unknown): void {
  assertNotCorrupt(key);
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    if (err instanceof DOMException && (err.name === "QuotaExceededError" || err.code === 22)) {
      throw new Error("Storage is full — export a reviewer and delete old quiz history to free space.");
    }
    throw err;
  }
}

// `subject`, `topics`, `questionCount`, and `updatedAt` were added after the
// first Reviewers were already saved. Backfilling on read (rather than in each
// component) means no screen has to defend against a missing field.
function normalize(reviewer: Reviewer): Reviewer {
  // The per-type breakdown is the setting the user edits; the flat total is
  // derived from it here so no read path can see the two disagree. Reviewers
  // saved before the breakdown existed get one split evenly from their total.
  //
  // Completeness is judged against the reviewer's own format, not the
  // global type list: a custom format's keys are the only ones that matter
  // here. An incomplete breakdown is re-split fresh from the stored total.
  const formatKeys = formatTypeKeys(resolveFormat(reviewer.examFormatId));
  const storedByType = reviewer.questionCountByType;
  const questionCountByType =
    storedByType && formatKeys.every((t) => Number.isInteger(storedByType[t]))
      ? storedByType
      : splitCountEvenly(reviewer.questionCount ?? DEFAULT_QUESTION_COUNT, formatKeys);

  return {
    ...reviewer,
    subject: reviewer.subject ?? "",
    topics: reviewer.topics ?? [],
    notes: reviewer.notes ?? "",
    projectMaterial: reviewer.projectMaterial ?? "",
    pastExamMaterial: reviewer.pastExamMaterial ?? "",
    // Reviewers saved before formats existed belong to the built-in they were
    // generated under — their questions, counts, and history are untouched.
    examFormatId: reviewer.examFormatId ?? CSOPESY_FINAL.id,
    questionCountByType,
    questionCount: sumCounts(questionCountByType),
    questions: reviewer.questions ?? [],
    updatedAt: reviewer.updatedAt ?? reviewer.createdAt,
    questionsGeneratedAt: reviewer.questionsGeneratedAt ?? reviewer.createdAt,
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
  writeJson(STORAGE_KEY, reviewers);
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
  writeJson(STORAGE_KEY, reviewers);
  // A deleted Reviewer's attempts would otherwise linger and reappear if its
  // id were ever reused — and the delete dialog promises the history goes too.
  deleteQuizHistory(id);
}

// Attempts live under their own key rather than on the Reviewer: they're
// append-only and unbounded, and keeping them separate means a Reviewer write
// (autosave, generation) can never race a quiz submit into overwriting one.
function getAllAttempts(): QuizAttempt[] {
  // Legacy attempts backfill to their own Reviewer's questionsGeneratedAt
  // (see normalizeAttempt) rather than a fixed sentinel. A Reviewer that
  // hasn't regenerated since this field shipped shows no divider at all —
  // regenerates that happened before this field existed aren't detectable
  // and don't get one either; only a regenerate from here on does.
  const reviewers = getReviewers();
  const generatedAtByReviewer = new Map(reviewers.map((r) => [r.id, r.questionsGeneratedAt]));
  const formatByReviewer = new Map(
    reviewers.map((r) => {
      const format = resolveFormat(r.examFormatId);
      return [r.id, { id: format.id, name: format.name }] as const;
    }),
  );
  return readJson<QuizAttempt>(ATTEMPTS_KEY).map((a) =>
    normalizeAttempt(a, generatedAtByReviewer, formatByReviewer),
  );
}

// Attempts recorded before the results screen became reopenable kept only the
// score. They stay in history — the score is still true — but with nothing to
// reopen, which is what an empty `questions` means to the history list.
function normalizeAttempt(
  attempt: QuizAttempt,
  generatedAtByReviewer: Map<string, string>,
  formatByReviewer: Map<string, { id: string; name: string }>,
): QuizAttempt {
  // The format snapshot backfills from the attempt's own reviewer, like the
  // set timestamp above; an orphaned attempt falls back to the built-in.
  const format = formatByReviewer.get(attempt.reviewerId) ?? {
    id: CSOPESY_FINAL.id,
    name: CSOPESY_FINAL.name,
  };
  return {
    ...attempt,
    questions: attempt.questions ?? [],
    answers: attempt.answers ?? {},
    unsureIds: attempt.unsureIds ?? [],
    // Falls back to the fixed sentinel only for an orphaned attempt whose
    // Reviewer was deleted — there's no set to match it to.
    questionSetGeneratedAt:
      attempt.questionSetGeneratedAt ?? generatedAtByReviewer.get(attempt.reviewerId) ?? LEGACY_QUESTION_SET,
    examFormatId: attempt.examFormatId ?? format.id,
    examFormatName: attempt.examFormatName ?? format.name,
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
// from the stored answers it's supposed to summarise. Takes the whole
// Reviewer, not just its id, so the attempt can snapshot which generated set
// `questions` was sampled from.
export function saveQuizAttempt(
  reviewer: Reviewer,
  questions: Question[],
  answers: Record<string, number>,
  unsureIds: string[],
): QuizAttempt {
  const format = resolveFormat(reviewer.examFormatId);
  const attempt: QuizAttempt = {
    id: newId(),
    reviewerId: reviewer.id,
    takenAt: new Date().toISOString(),
    score: questions.filter((q) => answers[q.id] === q.correctIndex).length,
    total: questions.length,
    questions,
    answers,
    unsureIds,
    questionSetGeneratedAt: reviewer.questionsGeneratedAt,
    examFormatId: format.id,
    examFormatName: format.name,
  };
  writeJson(ATTEMPTS_KEY, [...getAllAttempts(), attempt]);
  return attempt;
}

export function deleteQuizHistory(reviewerId: string): void {
  const remaining = getAllAttempts().filter((a) => a.reviewerId !== reviewerId);
  writeJson(ATTEMPTS_KEY, remaining);
}
