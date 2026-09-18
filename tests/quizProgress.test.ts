// @vitest-environment jsdom
// quizProgress.ts reads and writes localStorage, so these need a DOM global.
import { beforeEach, describe, expect, it } from "vitest";
import {
  PROGRESS_KEY,
  clearQuizProgress,
  getQuizProgress,
  saveQuizProgress,
  type QuizProgress,
} from "@/app/lib/quizProgress";

function progress(overrides: Partial<QuizProgress> = {}): QuizProgress {
  return {
    reviewerId: "r1",
    quizQuestions: [
      {
        id: "q1",
        type: "identification",
        question: "What is it?",
        options: ["a", "b"],
        correctIndex: 0,
        source: "notes",
      },
    ],
    answers: { q1: 1 },
    unsureIds: ["q1"],
    confirmedIds: ["q1"],
    timeLimitSec: 120,
    startedAt: Date.now() - 5000,
    formatId: "csopesy-final",
    feedbackMode: "immediate",
    savedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("getQuizProgress", () => {
  it("returns null when nothing is stored", () => {
    expect(getQuizProgress("r1")).toBeNull();
  });

  it("round-trips a saved snapshot with answers and timer start", () => {
    const saved = progress();
    saveQuizProgress(saved);
    const loaded = getQuizProgress("r1");
    expect(loaded).toMatchObject({
      reviewerId: "r1",
      answers: { q1: 1 },
      unsureIds: ["q1"],
      confirmedIds: ["q1"],
      timeLimitSec: 120,
      startedAt: saved.startedAt,
    });
    expect(loaded?.quizQuestions).toHaveLength(1);
  });

  it("keeps other reviewers' snapshots when saving", () => {
    saveQuizProgress(progress());
    saveQuizProgress(progress({ reviewerId: "r2", answers: {} }));
    expect(getQuizProgress("r1")?.answers).toEqual({ q1: 1 });
    expect(getQuizProgress("r2")?.answers).toEqual({});
  });

  it("returns null for corrupt JSON rather than throwing", () => {
    localStorage.setItem(PROGRESS_KEY, "{not json");
    expect(getQuizProgress("r1")).toBeNull();
  });

  it("returns null for a shape-invalid entry", () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ r1: { reviewerId: "r1" } }));
    expect(getQuizProgress("r1")).toBeNull();
  });

  it("returns null when the entry belongs to another reviewer", () => {
    localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({ r1: { ...progress(), reviewerId: "r2" } }),
    );
    expect(getQuizProgress("r1")).toBeNull();
  });

  it("backfills confirmedIds missing from older snapshots", () => {
    const legacy = JSON.parse(JSON.stringify(progress())) as Record<string, unknown>;
    delete legacy.confirmedIds;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ r1: legacy }));
    expect(getQuizProgress("r1")?.confirmedIds).toEqual([]);
  });
});

describe("clearQuizProgress", () => {
  it("removes only the reviewer's entry", () => {
    saveQuizProgress(progress());
    saveQuizProgress(progress({ reviewerId: "r2" }));
    clearQuizProgress("r1");
    expect(getQuizProgress("r1")).toBeNull();
    expect(getQuizProgress("r2")).not.toBeNull();
  });

  it("does nothing when nothing is stored", () => {
    expect(() => clearQuizProgress("r1")).not.toThrow();
  });
});
