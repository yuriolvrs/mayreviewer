import type { Question, QuestionSource, QuestionType } from "@/app/types";

// Shared question presentation + validation. These were duplicated across the
// edit/quiz/results screens and split between two divergent validators (the
// API route's and the importer's) before landing here.

export const QUESTION_TYPES: QuestionType[] = [
  "identification",
  "scenario",
  "timeline",
  "code",
];
export const QUESTION_SOURCES: QuestionSource[] = ["notes", "project", "manual"];

// How many questions a Reviewer asks for per generation. Lives here because
// the API route clamps against it and two forms validate against it — it was
// hardcoded in six places, so raising the ceiling meant finding all six.
//
// The ceiling is a sanity bound, not a recommendation: what actually degrades
// first is per-call quality and free-tier rate limits, well before 200.
export const MIN_QUESTION_COUNT = 1;
export const MAX_QUESTION_COUNT = 200;
export const DEFAULT_QUESTION_COUNT = 10;

export const TYPE_LABELS: Record<QuestionType, string> = {
  identification: "Identification",
  scenario: "Scenario",
  timeline: "Timeline",
  code: "Code",
};

export const SOURCE_LABELS: Record<QuestionSource, string> = {
  notes: "Notes",
  project: "Project",
  manual: "Manual",
};

// Timeline tables and code snippets live inside the question string as plain
// text — they only stay readable in a monospace face with whitespace kept.
export function isPreformatted(type: QuestionType): boolean {
  return type === "timeline" || type === "code";
}

// Consecutive questions sharing a `groupId` are one set over one problem, so
// the problem gets rendered once above them instead of repeated per question.
// Standalone questions come back as their own single-entry group, which lets
// the quiz/results screens render one uniform list.
export type QuestionGroup = {
  key: string;
  title?: string;
  stimulus?: string;
  questions: Question[];
};

export function groupQuestions(questions: Question[]): QuestionGroup[] {
  const groups: QuestionGroup[] = [];
  for (const question of questions) {
    const last = groups[groups.length - 1];
    if (question.groupId && last?.key === question.groupId) {
      last.questions.push(question);
      continue;
    }
    groups.push({
      key: question.groupId ?? question.id,
      title: question.groupTitle,
      stimulus: question.stimulus,
      questions: [question],
    });
  }
  return groups;
}

export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

// Red at a failing score, easing through the warning tone and landing on green
// once the attempt is solid — the number itself carries the verdict. Shared so
// a score reads the same on the results screen and in the attempts list.
export function scoreTone(percent: number): string {
  if (percent < 50) return "text-error";
  if (percent < 80) return "text-warning";
  return "text-success";
}

// Seconds are noise on a list of attempts. Today's are the ones being compared
// most, so they get a relative label; anything older reads as a plain date, with
// the year only once it stops being obvious.
export function formatTakenAt(takenAt: string): string {
  const date = new Date(takenAt);
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (date.toDateString() === now.toDateString()) return `Today, ${time}`;

  const day = date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
  return `${day}, ${time}`;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

// Everything except `id` — the API route validates model output before it has
// assigned ids, while the importer validates questions that already carry one.
export function isValidQuestionFields(value: unknown): value is Omit<Question, "id"> {
  if (typeof value !== "object" || value === null) return false;
  const q = value as Record<string, unknown>;
  return (
    isOptionalString(q.groupId) &&
    isOptionalString(q.groupTitle) &&
    isOptionalString(q.stimulus) &&
    isOptionalString(q.explanation) &&
    typeof q.type === "string" &&
    QUESTION_TYPES.includes(q.type as QuestionType) &&
    typeof q.question === "string" &&
    Array.isArray(q.options) &&
    // Generated questions are always 4 options (the model's response schema
    // pins that), but hand-written ones can drop to 2 — so the floor is 2, not
    // an exact count, or importing a manual question would silently drop it.
    q.options.length >= 2 &&
    q.options.every((o) => typeof o === "string") &&
    typeof q.correctIndex === "number" &&
    Number.isInteger(q.correctIndex) &&
    q.correctIndex >= 0 &&
    q.correctIndex < q.options.length &&
    typeof q.source === "string" &&
    QUESTION_SOURCES.includes(q.source as QuestionSource)
  );
}

export function isQuestion(value: unknown): value is Question {
  return (
    isValidQuestionFields(value) && typeof (value as Record<string, unknown>).id === "string"
  );
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Picking the first N questions in stored order would skew a shortened quiz
// toward whichever type generation happened to emit first. Each type instead
// gets a share of the quiz matching its share of the pool, and which specific
// questions fill that share is random per attempt, so retaking the same scope
// and count doesn't serve the identical subset.
export function sampleProportionally(pool: Question[], count: number): Question[] {
  if (count <= 0) return [];
  if (count >= pool.length) return pool;

  const order = new Map(pool.map((q, i) => [q.id, i]));
  const byType = new Map<QuestionType, Question[]>();
  for (const question of pool) {
    const bucket = byType.get(question.type) ?? [];
    bucket.push(question);
    byType.set(question.type, bucket);
  }

  const types = [...byType.keys()];
  const quota = new Map<QuestionType, number>(
    types.map((type) => [
      type,
      Math.floor((byType.get(type)!.length / pool.length) * count),
    ]),
  );

  // Flooring every share leaves a remainder. Handing it out in a random order
  // each time keeps the same type from always collecting the extra question.
  let leftover = count - [...quota.values()].reduce((sum, n) => sum + n, 0);
  while (leftover > 0) {
    const withRoom = shuffle(types).filter((t) => quota.get(t)! < byType.get(t)!.length);
    if (withRoom.length === 0) break;
    for (const type of withRoom) {
      if (leftover === 0) break;
      quota.set(type, quota.get(type)! + 1);
      leftover--;
    }
  }

  return types
    .flatMap((type) => shuffle(byType.get(type)!).slice(0, quota.get(type)!))
    // Back into pool order so questions belonging to the same problem set stay
    // adjacent and still render under one shared problem.
    .sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

// Generation asks each source for an exact count, but the model doesn't hold to
// it — a single problem set is 5-10 questions on its own — and the per-source
// budgets are floored at 1 each, so they can already sum past what was asked
// for. Without a check on the way in, a 50-question request came back with 60.
//
// Sets are kept whole: a problem delivered with half its questions is worse
// than a batch that lands a little short. The one exception is a set larger
// than the entire budget, which is truncated rather than dropped, since
// skipping it would return nothing at all.
// Large requests are generated in several passes over the same material, and
// separate sources often overlap, so the same question can come back twice.
// Matching on the question text alone (normalised) rather than the options,
// since a duplicate asked with shuffled choices is still a duplicate.
export function dedupeQuestions(questions: Question[]): Question[] {
  const seen = new Set<string>();
  return questions.filter((q) => {
    const key = q.question.toLowerCase().replace(/\s+/g, " ").trim();
    // A set's questions are meaningless without their siblings, so they're
    // never dropped — "Blank (3): what belongs here?" legitimately recurs
    // across different code listings.
    if (q.groupId) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function takeWithinBudget(questions: Question[], budget: number): Question[] {
  if (budget <= 0) return [];

  const groups = groupQuestions(questions);

  // A group that doesn't fit is skipped rather than ending the loop — a later,
  // smaller set (or a run of standalone questions) can still use the room.
  const kept: Question[] = [];
  for (const group of groups) {
    if (group.questions.length <= budget - kept.length) kept.push(...group.questions);
  }

  // Only when nothing fit whole would we return an empty batch — take a
  // partial set instead, since no questions at all is the worse outcome.
  if (kept.length === 0) return groups[0]?.questions.slice(0, budget) ?? [];

  return kept;
}
