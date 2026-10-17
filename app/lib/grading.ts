import {
  MAX_KEY_POINTS,
  MAX_KEY_POINT_CHARS,
  MAX_MODEL_ANSWER_CHARS,
  MAX_SHORT_ANSWER_CHARS,
  isShortAnswer,
} from "@/app/lib/questions";
import type { Question, ShortGrade } from "@/app/types";

// Shared by the grade route, the client that calls it, and the tests: what one
// item to grade looks like, and how a list of "met" key points becomes credit.
// The model never reports a score — it reports which key points an answer
// covers, and the number is computed here, so the credit can only ever be one
// of the n+1 values the rubric allows.

export const MAX_GRADE_ITEMS = 50;
export const MAX_GRADE_QUESTION_CHARS = 1000;
export const MAX_FEEDBACK_CHARS = 400;

export type GradeItem = {
  id: string;
  question: string;
  modelAnswer: string;
  keyPoints: string[];
  // What the student typed. May be blank — blanks are graded locally, never sent.
  answer: string;
};

export type GradeResponse = {
  grades: Record<string, ShortGrade>;
  // Ids the grader could not grade (a model failure, or an item it skipped).
  // These are stored as ungraded rather than as zero credit.
  failed: string[];
};

// Distinct, in-range indices only, so a model that repeats a point or invents
// point 9 of 3 cannot inflate the credit.
export function sanitizeMet(raw: unknown, total: number): number[] {
  if (!Array.isArray(raw)) return [];
  const met = new Set<number>();
  for (const value of raw) {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < total) {
      met.add(value);
    }
  }
  return [...met].sort((a, b) => a - b);
}

// Two decimals so a one-in-three credit stays a stable stored value.
export function creditFromMet(met: number[], total: number): number {
  if (total <= 0) return 0;
  return Math.round((met.length / total) * 100) / 100;
}

// An identification item asks for one name or term, so naming it is the
// whole answer. Its key points often restate facts the question already gives
// (dates, events), which the student has no reason to repeat. When the model
// answer is a short term and the student names it, every key point is met.
export const MAX_TERM_WORDS = 8;

function normalizeTerm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/^(the|a|an) /, "")
    .trim();
}

export function namesModelTerm(modelAnswer: string, answer: string, modelSaysNamed: boolean): boolean {
  const term = normalizeTerm(modelAnswer);
  if (term === "" || term.split(" ").length > MAX_TERM_WORDS) return false;
  return modelSaysNamed || ` ${normalizeTerm(answer)} `.includes(` ${term} `);
}

export function blankGrade(): ShortGrade {
  return { met: [], feedback: "No answer given.", credit: 0 };
}

// One item per short-answer question in the attempt, in quiz order. Questions
// without a usable rubric are skipped: there is nothing to grade them against.
export function buildGradeItems(
  questions: Question[],
  textAnswers: Record<string, string>,
): GradeItem[] {
  return questions.flatMap((q) => {
    if (!isShortAnswer(q) || !q.modelAnswer || !q.keyPoints || q.keyPoints.length === 0) return [];
    return [
      {
        id: q.id,
        question: q.question,
        modelAnswer: q.modelAnswer,
        keyPoints: q.keyPoints,
        answer: textAnswers[q.id] ?? "",
      },
    ];
  });
}

// Untrusted wire input → bounded items. Malformed entries are dropped; the
// caller treats an id that never came back as ungraded.
export function cleanGradeItems(raw: unknown): GradeItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const items: GradeItem[] = [];
  for (const entry of raw.slice(0, MAX_GRADE_ITEMS)) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string" || e.id.length === 0 || e.id.length > 100 || seen.has(e.id)) continue;
    if (typeof e.question !== "string" || e.question.trim() === "") continue;
    if (typeof e.modelAnswer !== "string" || e.modelAnswer.trim() === "") continue;
    if (!Array.isArray(e.keyPoints)) continue;
    const keyPoints = e.keyPoints
      .filter((p): p is string => typeof p === "string" && p.trim() !== "")
      .slice(0, MAX_KEY_POINTS)
      .map((p) => p.trim().slice(0, MAX_KEY_POINT_CHARS));
    if (keyPoints.length === 0) continue;

    seen.add(e.id);
    items.push({
      id: e.id,
      question: e.question.trim().slice(0, MAX_GRADE_QUESTION_CHARS),
      modelAnswer: e.modelAnswer.trim().slice(0, MAX_MODEL_ANSWER_CHARS),
      keyPoints,
      answer: typeof e.answer === "string" ? e.answer.trim().slice(0, MAX_SHORT_ANSWER_CHARS) : "",
    });
  }
  return items;
}
