// @vitest-environment jsdom
// deleteWarning reads quiz history out of localStorage.
import { beforeEach, describe, expect, it } from "vitest";
import { deleteWarning } from "@/app/lib/reviewers";
import { saveQuizAttempt } from "@/app/lib/storage";
import type { Question, Reviewer } from "@/app/types";

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
    reviewerName: "CPU Scheduling",
    subject: "OS",
    topics: [],
    notes: "",
    projectMaterial: "",
    questionCount: 10,
    questionCountByType: { identification: 3, scenario: 2, timeline: 2, code: 3 },
    questions: [question("q1"), question("q2")],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    questionsGeneratedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("deleteWarning", () => {
  it("names the Reviewer and counts its questions", () => {
    const warning = deleteWarning(reviewer());
    expect(warning).toContain('"CPU Scheduling"');
    expect(warning).toContain("2 questions");
  });

  it("singularizes a one-question Reviewer", () => {
    expect(deleteWarning(reviewer({ questions: [question("q1")] }))).toContain("1 question,");
  });

  // The dialog promises attachments go too, so removeReviewerCompletely has to
  // actually clear IndexedDB — these two have to stay in step.
  it("always mentions uploaded files", () => {
    expect(deleteWarning(reviewer())).toContain("uploaded files");
  });

  it("calls out quiz history only when attempts exist", () => {
    expect(deleteWarning(reviewer())).not.toContain("quiz history");

    saveQuizAttempt(reviewer(), [question("q1")], { q1: 0 }, []);
    const warning = deleteWarning(reviewer());
    expect(warning).toContain("quiz history");
    expect(warning).toContain('"CPU Scheduling"');
  });

  it("scopes the history check to this Reviewer", () => {
    saveQuizAttempt(reviewer({ id: "someone-else" }), [question("q1")], { q1: 0 }, []);
    expect(deleteWarning(reviewer())).not.toContain("quiz history");
  });
});
