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
// (dates, events), which the student has no reason to repeat. When the term is
// short and the student names it, every key point is met. The term is the
// model answer if it is short, or the first key point of a question that asks
// for a name (model answers are often a full sentence around the term).
export const MAX_TERM_WORDS = 8;

function normalizeTerm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/^(the|a|an) /, "")
    .trim();
}

// An answer that denies the term ("not the Reign of Terror") does not name it.
const NEGATION = /\b(not|no|never|isn't|wasn't|aren't|weren't)\b/i;

const TERM_STEM =
  /^\s*(identify|name)\b|\bwhat (is|was|are|were) (the |this |that )?([a-z]+ )?name\b|\bwhat (is|was) (this|it|that) called\b|\bcalled\?\s*$|\bwhat do (you|we) call\b|\b(what|which) term\b|^\s*who (is|was|were) the\b/i;

// True for question stems that ask for a name or term.
export function asksForTerm(question: string): boolean {
  return TERM_STEM.test(question);
}

export function namesModelTerm(
  item: Pick<GradeItem, "question" | "modelAnswer" | "keyPoints">,
  answer: string,
  modelSaysNamed: boolean,
): boolean {
  const candidates = [item.modelAnswer];
  if (asksForTerm(item.question) && item.keyPoints.length > 0) candidates.push(item.keyPoints[0]);
  const terms = candidates
    .map(normalizeTerm)
    .filter((t) => t !== "" && t.split(" ").length <= MAX_TERM_WORDS);
  if (terms.length === 0) return false;
  if (modelSaysNamed) return true;
  if (NEGATION.test(answer)) return false;
  const normalized = ` ${normalizeTerm(answer)} `;
  return terms.some((t) => normalized.includes(` ${t} `));
}

const STEM_STOPWORDS = new Set(
  "the a an of to in on for and or by with as at from is was were are be it its that this regarding about into".split(" "),
);

// Crude stem: "marched" and "march" match, "shortages" and "shortage" match.
function stemWord(w: string): string {
  for (const suffix of ["ing", "ed", "es", "s"]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 4) return w.slice(0, -suffix.length);
  }
  return w;
}

function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== "" && !STEM_STOPWORDS.has(w) && (w.length >= 3 || /^\d+$/.test(w)))
    .map(stemWord);
}

// Runs of capitalized words ("Napoleon Bonaparte"). The point's first word is
// capitalized by position only, so it counts only when it starts a longer run.
function properNamePhrases(point: string): string[][] {
  const words = point.split(/[^\p{L}\p{N}']+/u).filter((w) => w !== "");
  const phrases: string[][] = [];
  let run: string[] = [];
  let runStart = 0;
  const flush = () => {
    if (run.length > 0 && (runStart > 0 || run.length >= 2)) phrases.push(run);
    run = [];
  };
  words.forEach((w, i) => {
    if (/^\p{Lu}/u.test(w) && !/^\d/.test(w)) {
      if (run.length === 0) runStart = i;
      run.push(w);
    } else {
      flush();
    }
  });
  flush();
  return phrases;
}

// "restated": every name and number is already in the stem. "new": it names
// something the stem does not. "unclear": no proper name to judge by.
function stemNameVerdict(
  point: string,
  stemTokens: Set<string>,
  stemNumbers: Set<string>,
): "restated" | "new" | "unclear" {
  const phrases = properNamePhrases(point);
  if (phrases.length === 0) return "unclear";
  const inStem = phrases.every((phrase) => phrase.some((w) => stemTokens.has(w.toLowerCase())));
  if (!inStem) return "new";
  return (point.match(/\d+/g) ?? []).every((n) => stemNumbers.has(n)) ? "restated" : "unclear";
}

// For a name/term question, drops later key points that mostly repeat the
// question itself. The first key point (the term) always stays.
export function dropStemKeyPoints(question: string, keyPoints: string[]): string[] {
  if (!asksForTerm(question)) return keyPoints;
  const stem = new Set(contentWords(question));
  const stemTokens = new Set(question.toLowerCase().split(/[^\p{L}\p{N}']+/u));
  const stemNumbers = new Set(question.match(/\d+/g) ?? []);
  return keyPoints.filter((point, i) => {
    if (i === 0) return true;
    const verdict = stemNameVerdict(point, stemTokens, stemNumbers);
    if (verdict === "restated") return false;
    if (verdict === "new") return true;
    const words = contentWords(point);
    if (words.length === 0) return true;
    return words.filter((w) => stem.has(w)).length * 2 < words.length;
  });
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
