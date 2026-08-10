// @vitest-environment jsdom
// storage.ts reads and writes localStorage, so these need a DOM global.
import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteReviewer,
  getQuizHistory,
  getReviewer,
  getReviewers,
  hasQuizHistory,
  saveQuizAttempt,
  saveReviewer,
  updateReviewer,
} from "@/app/lib/storage";
import type { Question, Reviewer } from "@/app/types";

const REVIEWERS_KEY = "mayreviewer-reviewers";
const ATTEMPTS_KEY = "mayreviewer-quiz-attempts";

function question(id: string): Question {
  return {
    id,
    type: "identification",
    question: "q?",
    options: ["A", "B", "C", "D"],
    correctIndex: 0,
    source: "notes",
  };
}

function reviewer(overrides: Partial<Reviewer> = {}): Reviewer {
  return {
    id: "r1",
    reviewerName: "Reviewer",
    subject: "OS",
    topics: ["Paging"],
    notes: "notes",
    projectMaterial: "",
    questionCount: 10,
    questions: [question("q1")],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

// The subset a quiz attempt was served, as saveQuizAttempt receives it.
const asked = [question("q1"), question("q2")];

beforeEach(() => {
  localStorage.clear();
});

describe("getReviewers", () => {
  it("returns [] when nothing is stored", () => {
    expect(getReviewers()).toEqual([]);
  });

  it.each([
    ["corrupt JSON", "{not json"],
    ["a non-array value", '{"id":"r1"}'],
  ])("returns [] for %s rather than throwing", (_label, raw) => {
    localStorage.setItem(REVIEWERS_KEY, raw);
    expect(getReviewers()).toEqual([]);
  });

  // subject/topics/questionCount were added mid-build. Reviewers saved before
  // then crashed the Details tab on open until this backfill existed.
  it("backfills fields missing from pre-migration Reviewers", () => {
    localStorage.setItem(
      REVIEWERS_KEY,
      JSON.stringify([{ id: "old", reviewerName: "Legacy", createdAt: "2026-08-01T00:00:00.000Z" }]),
    );

    const [migrated] = getReviewers();
    expect(migrated.subject).toBe("");
    expect(migrated.topics).toEqual([]);
    expect(migrated.questionCount).toBe(10);
    expect(migrated.questions).toEqual([]);
    expect(migrated.notes).toBe("");
    expect(migrated.projectMaterial).toBe("");
    expect(migrated.updatedAt).toBe("2026-08-01T00:00:00.000Z");
  });

  it("leaves already-complete Reviewers untouched", () => {
    saveReviewer(reviewer({ questionCount: 25 }));
    expect(getReviewers()[0].questionCount).toBe(25);
  });
});

describe("saveReviewer", () => {
  it("inserts a new Reviewer and updates an existing one in place", () => {
    saveReviewer(reviewer());
    saveReviewer(reviewer({ reviewerName: "Renamed" }));

    const all = getReviewers();
    expect(all).toHaveLength(1);
    expect(all[0].reviewerName).toBe("Renamed");
  });

  // Stamped here rather than trusted from the caller, so every write path —
  // autosave, generation, question edits, imports — reflects "last edited"
  // the same way and none can forget to set it.
  it("stamps updatedAt on every save, overriding whatever the caller passed", () => {
    saveReviewer(reviewer({ updatedAt: "2000-01-01T00:00:00.000Z" }));
    expect(getReviewer("r1")!.updatedAt).not.toBe("2000-01-01T00:00:00.000Z");
  });
});

describe("updateReviewer", () => {
  it("merges the patch without disturbing untouched fields", () => {
    saveReviewer(reviewer());
    updateReviewer("r1", { questions: [question("q1"), question("q2")] });

    const stored = getReviewer("r1");
    expect(stored?.questions).toHaveLength(2);
    expect(stored?.notes).toBe("notes");
    expect(stored?.topics).toEqual(["Paging"]);
  });

  // The whole point of this function: a caller holding a stale copy must not
  // be able to revert a field it never edited.
  it("writes against current storage, not a stale caller copy", () => {
    saveReviewer(reviewer());
    const stale = getReviewer("r1")!;

    // Something else saves in the meantime (an autosave, a finished generation).
    saveReviewer({ ...stale, notes: "typed while the other tab was open" });

    // The stale holder edits only questions.
    updateReviewer("r1", { questions: [...stale.questions, question("q2")] });

    const stored = getReviewer("r1");
    expect(stored?.notes).toBe("typed while the other tab was open");
    expect(stored?.questions).toHaveLength(2);
  });

  it("returns undefined for an unknown id and writes nothing", () => {
    expect(updateReviewer("nope", { notes: "x" })).toBeUndefined();
    expect(getReviewers()).toEqual([]);
  });
});

describe("quiz history", () => {
  it("starts empty", () => {
    expect(getQuizHistory("r1")).toEqual([]);
    expect(hasQuizHistory("r1")).toBe(false);
  });

  it("records attempts and reports them newest first", () => {
    saveQuizAttempt("r1", asked, { q1: 1 }, []);
    saveQuizAttempt("r1", asked, { q1: 0, q2: 0 }, []);

    const history = getQuizHistory("r1");
    expect(history).toHaveLength(2);
    expect(history[0].takenAt >= history[1].takenAt).toBe(true);
    expect(history.map((a) => a.score).sort()).toEqual([0, 2]);
    expect(hasQuizHistory("r1")).toBe(true);
  });

  it("scores the attempt from the answers it stores", () => {
    const attempt = saveQuizAttempt("r1", asked, { q1: 0, q2: 3 }, ["q2"]);

    expect(attempt.score).toBe(1);
    expect(attempt.total).toBe(2);
    expect(getQuizHistory("r1")[0]).toEqual(attempt);
  });

  it("keeps its own copy of the questions asked", () => {
    saveQuizAttempt("r1", asked, { q1: 0 }, []);
    // Editing the pool afterward must not rewrite what an old attempt asked.
    saveReviewer(reviewer({ questions: [{ ...question("q1"), question: "rewritten" }] }));

    expect(getQuizHistory("r1")[0].questions).toEqual(asked);
  });

  it("scopes history to one Reviewer", () => {
    saveQuizAttempt("r1", asked, { q1: 0, q2: 0 }, []);
    saveQuizAttempt("r2", asked, { q1: 1 }, []);

    expect(getQuizHistory("r1")).toHaveLength(1);
    expect(getQuizHistory("r1")[0].score).toBe(2);
    expect(hasQuizHistory("r2")).toBe(true);
  });

  it("reads attempts stored before answers were kept", () => {
    localStorage.setItem(
      ATTEMPTS_KEY,
      JSON.stringify([
        { id: "a1", reviewerId: "r1", takenAt: "2026-08-01T00:00:00.000Z", score: 1, total: 4 },
      ]),
    );

    const [attempt] = getQuizHistory("r1");
    expect(attempt.score).toBe(1);
    expect(attempt.questions).toEqual([]);
    expect(attempt.answers).toEqual({});
    expect(attempt.unsureIds).toEqual([]);
  });

  it("survives a corrupt attempts key", () => {
    localStorage.setItem(ATTEMPTS_KEY, "{not json");
    expect(getQuizHistory("r1")).toEqual([]);
  });
});

describe("deleteReviewer", () => {
  it("removes the Reviewer and its attempts, leaving others alone", () => {
    saveReviewer(reviewer());
    saveReviewer(reviewer({ id: "r2" }));
    saveQuizAttempt("r1", asked, { q1: 0 }, []);
    saveQuizAttempt("r2", asked, { q2: 0 }, []);

    deleteReviewer("r1");

    expect(getReviewer("r1")).toBeUndefined();
    expect(getQuizHistory("r1")).toEqual([]);
    expect(getReviewer("r2")).toBeDefined();
    expect(getQuizHistory("r2")).toHaveLength(1);
  });
});
