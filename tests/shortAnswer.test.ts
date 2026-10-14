// @vitest-environment jsdom
// Short-answer questions: validation, partial credit, and graded attempts.
import { beforeEach, describe, expect, it } from "vitest";
import {
  formatScore,
  isAnswered,
  isFullCredit,
  isValidQuestionFields,
  missedIds,
  questionCredit,
  shuffleOptions,
  sumCredit,
} from "@/app/lib/questions";
import {
  dismissStorageCorruption,
  getQuizHistory,
  overrideGrade,
  saveQuizAttempt,
  updateAttemptGrades,
} from "@/app/lib/storage";
import { mergeAttempts } from "@/app/lib/sync";
import { OS_EXAM } from "@/app/lib/examFormats";
import type { Question, QuizAttempt, Reviewer, ShortGrade } from "@/app/types";

function short(overrides: Record<string, unknown> = {}) {
  return {
    type: "recall",
    question: "Why does paging avoid external fragmentation?",
    options: [],
    correctIndex: -1,
    source: "notes",
    answerKind: "short",
    modelAnswer: "Frames are fixed size, so any free frame fits any page.",
    keyPoints: ["Frames are fixed size", "Any free frame can hold any page"],
    ...overrides,
  };
}

function shortQuestion(id: string, overrides: Record<string, unknown> = {}): Question {
  return { id, ...short(overrides) } as Question;
}

function choiceQuestion(id: string): Question {
  return {
    id,
    type: "identification",
    question: "What is a page?",
    options: ["A", "B", "C", "D"],
    correctIndex: 2,
    source: "notes",
  };
}

function reviewer(): Reviewer {
  return {
    id: "r1",
    reviewerName: "Reviewer",
    subject: "",
    topics: [],
    notes: "",
    projectMaterial: "",
    pastExamMaterial: "",
    examFormatId: OS_EXAM.id,
    questionCount: 10,
    questionCountByType: {},
    questions: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    questionsGeneratedAt: "2026-08-01T00:00:00.000Z",
  };
}

const grade = (credit: number, extra: Partial<ShortGrade> = {}): ShortGrade => ({
  met: [],
  feedback: "",
  credit,
  ...extra,
});

describe("isValidQuestionFields for short answers", () => {
  it("accepts a short question with no options and a rubric", () => {
    expect(isValidQuestionFields(short())).toBe(true);
  });

  it("still accepts choice questions with no answerKind", () => {
    expect(
      isValidQuestionFields({
        type: "identification",
        question: "Q?",
        options: ["A", "B"],
        correctIndex: 1,
        source: "notes",
      }),
    ).toBe(true);
  });

  it("rejects a short question that carries options", () => {
    expect(isValidQuestionFields(short({ options: ["A", "B"] }))).toBe(false);
  });

  it("rejects a short question without a usable rubric", () => {
    expect(isValidQuestionFields(short({ keyPoints: [] }))).toBe(false);
    expect(isValidQuestionFields(short({ keyPoints: ["ok", "  "] }))).toBe(false);
    expect(isValidQuestionFields(short({ keyPoints: Array(6).fill("point") }))).toBe(false);
    expect(isValidQuestionFields(short({ modelAnswer: "   " }))).toBe(false);
    expect(isValidQuestionFields(short({ modelAnswer: undefined }))).toBe(false);
  });

  it("rejects a short question whose correctIndex is not -1", () => {
    expect(isValidQuestionFields(short({ correctIndex: 0 }))).toBe(false);
  });

  it("rejects an unknown answerKind", () => {
    expect(isValidQuestionFields(short({ answerKind: "essay" }))).toBe(false);
  });

  it("rejects a choice question marked short without a rubric", () => {
    expect(
      isValidQuestionFields({
        type: "identification",
        question: "Q?",
        options: ["A", "B"],
        correctIndex: 1,
        source: "notes",
        answerKind: "short",
      }),
    ).toBe(false);
  });
});

describe("credit helpers", () => {
  const choice = choiceQuestion("c");
  const open = shortQuestion("s");

  it("scores a choice question 0 or 1 and a short answer by its grade", () => {
    expect(questionCredit(choice, { c: 2 })).toBe(1);
    expect(questionCredit(choice, { c: 0 })).toBe(0);
    expect(questionCredit(open, {}, { s: grade(0.5) })).toBe(0.5);
  });

  it("gives an ungraded or malformed short answer zero", () => {
    expect(questionCredit(open, {})).toBe(0);
    expect(questionCredit(open, {}, { s: grade(Number.NaN) })).toBe(0);
  });

  it("clamps credit into 0..1", () => {
    expect(questionCredit(open, {}, { s: grade(4) })).toBe(1);
    expect(questionCredit(open, {}, { s: grade(-2) })).toBe(0);
  });

  it("treats only full credit as correct", () => {
    expect(isFullCredit(open, {}, { s: grade(1) })).toBe(true);
    expect(isFullCredit(open, {}, { s: grade(0.67) })).toBe(false);
  });

  it("sums fractional credit without float noise", () => {
    const qs = [shortQuestion("a"), shortQuestion("b"), shortQuestion("c")];
    const grades = { a: grade(1 / 3), b: grade(1 / 3), c: grade(1 / 3) };
    expect(sumCredit(qs, {}, grades)).toBe(1);
  });

  it("lists partial and ungraded short answers as missed", () => {
    const ids = missedIds(
      [choice, open, shortQuestion("t")],
      { c: 2 },
      { s: grade(0.5), t: grade(1) },
    );
    expect(ids).toEqual(["s"]);
  });

  it("formats whole scores plainly and partial ones with decimals", () => {
    expect(formatScore(3)).toBe("3");
    expect(formatScore(2.5)).toBe("2.5");
    expect(formatScore(2.67)).toBe("2.7");
    expect(formatScore(2.96)).toBe("2.96");
  });

  it("counts a short answer as answered only with non-blank text", () => {
    expect(isAnswered(open, {}, { s: "  " })).toBe(false);
    expect(isAnswered(open, {}, { s: "frames" })).toBe(true);
    expect(isAnswered(choice, { c: 0 })).toBe(true);
    expect(isAnswered(choice, {})).toBe(false);
  });

  it("leaves a short question untouched when shuffling", () => {
    expect(shuffleOptions(open)).toBe(open);
  });
});

describe("graded attempts in storage", () => {
  beforeEach(() => {
    localStorage.clear();
    dismissStorageCorruption("mayreviewer-quiz-attempts");
  });

  const questions = [choiceQuestion("c"), shortQuestion("s")];

  function save() {
    return saveQuizAttempt(
      reviewer(),
      questions,
      { c: 2 },
      [],
      { durationSec: 30, timedOut: false },
      { textAnswers: { s: "Fixed size frames" }, grades: { s: grade(0.5, { met: [0] }) } },
    );
  }

  it("scores an attempt with partial credit and keeps the typed answer", () => {
    const attempt = save();
    expect(attempt.score).toBe(1.5);
    expect(attempt.total).toBe(2);
    const [stored] = getQuizHistory("r1");
    expect(stored.textAnswers).toEqual({ s: "Fixed size frames" });
    expect(stored.grades?.s.met).toEqual([0]);
  });

  it("scores a choice-only attempt exactly as before", () => {
    const attempt = saveQuizAttempt(reviewer(), [choiceQuestion("c")], { c: 2 }, []);
    expect(attempt.score).toBe(1);
    expect(attempt.grades).toEqual({});
  });

  it("recomputes the score and stamps gradedAt when grades are updated", () => {
    const attempt = saveQuizAttempt(reviewer(), questions, { c: 2 }, [], undefined, {
      textAnswers: { s: "x" },
      grades: { s: grade(0, { ungraded: true }) },
    });
    expect(attempt.score).toBe(1);
    const updated = updateAttemptGrades(attempt.id, { s: grade(1, { met: [0, 1] }) });
    expect(updated?.score).toBe(2);
    expect(updated?.gradedAt).toBeTruthy();
  });

  it("overrides a grade to full or no credit and keeps the AI feedback", () => {
    const attempt = save();
    const wrong = overrideGrade(attempt.id, "s", 0);
    expect(wrong?.score).toBe(1);
    expect(wrong?.grades?.s.overridden).toBe(true);
    expect(wrong?.grades?.s.met).toEqual([0]);
    const right = overrideGrade(attempt.id, "s", 1);
    expect(right?.score).toBe(2);
  });

  it("returns null for an attempt that no longer exists", () => {
    expect(updateAttemptGrades("missing", {})).toBeNull();
    expect(overrideGrade("missing", "s", 1)).toBeNull();
  });

  it("backfills grade fields on attempts saved before short answers", () => {
    const legacy = {
      id: "old",
      reviewerId: "r1",
      takenAt: "2026-01-01T00:00:00.000Z",
      score: 1,
      total: 1,
      questions: [choiceQuestion("c")],
      answers: { c: 2 },
      unsureIds: [],
    };
    localStorage.setItem("mayreviewer-quiz-attempts", JSON.stringify([legacy]));
    const [attempt] = getQuizHistory("r1");
    expect(attempt.textAnswers).toEqual({});
    expect(attempt.grades).toEqual({});
  });
});

describe("mergeAttempts with graded attempts", () => {
  const base = (over: Partial<QuizAttempt>): QuizAttempt => ({
    id: "a",
    reviewerId: "r1",
    takenAt: "2026-01-01T00:00:00.000Z",
    score: 1,
    total: 2,
    questions: [],
    answers: {},
    unsureIds: [],
    questionSetGeneratedAt: "x",
    examFormatId: "f",
    examFormatName: "F",
    ...over,
  });

  it("prefers the copy graded later, whichever side holds it", () => {
    const stale = base({ score: 1 });
    const graded = base({ score: 2, gradedAt: "2026-02-01T00:00:00.000Z" });
    expect(mergeAttempts([stale], [graded])[0].score).toBe(2);
    expect(mergeAttempts([graded], [stale])[0].score).toBe(2);
  });

  it("keeps local when neither side was graded later", () => {
    const local = base({ score: 1 });
    const cloud = base({ score: 9 });
    expect(mergeAttempts([local], [cloud])[0].score).toBe(1);
  });
});
