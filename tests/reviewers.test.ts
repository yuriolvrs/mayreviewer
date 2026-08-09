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
    questions: [question("q1"), question("q2")],
    createdAt: "2026-08-01T00:00:00.000Z",
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

    saveQuizAttempt("r1", 3, 4);
    const warning = deleteWarning(reviewer());
    expect(warning).toContain("quiz history");
    expect(warning).toContain('"CPU Scheduling"');
  });

  it("scopes the history check to this Reviewer", () => {
    saveQuizAttempt("someone-else", 3, 4);
    expect(deleteWarning(reviewer())).not.toContain("quiz history");
  });
});
