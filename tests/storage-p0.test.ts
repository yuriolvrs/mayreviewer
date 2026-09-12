// @vitest-environment jsdom
// P0 guards: corrupt stores must back up and refuse overwrite; quota errors
// must surface instead of crashing autosave.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  dismissStorageCorruption,
  getReviewers,
  isStorageCorrupt,
  saveReviewer,
  storageCorruptionBackupKeys,
} from "@/app/lib/storage";
import { CSOPESY_FINAL } from "@/app/lib/examFormats";
import type { Reviewer } from "@/app/types";

const REVIEWERS_KEY = "mayreviewer-reviewers";

function reviewer(): Reviewer {
  return {
    id: "r1",
    reviewerName: "Reviewer",
    subject: "",
    topics: [],
    notes: "",
    projectMaterial: "",
    pastExamMaterial: "",
    examFormatId: CSOPESY_FINAL.id,
    questionCount: 10,
    questionCountByType: { identification: 2, scenario: 2, timeline: 2, code: 2, "modified-tf": 2 },
    questions: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    questionsGeneratedAt: "2026-08-01T00:00:00.000Z",
  };
}

beforeEach(() => {
  localStorage.clear();
  dismissStorageCorruption(REVIEWERS_KEY);
  dismissStorageCorruption("mayreviewer-quiz-attempts");
});

describe("corrupt storage", () => {
  it("backs up corrupt JSON and flags the key", () => {
    localStorage.setItem(REVIEWERS_KEY, "{not json");
    expect(getReviewers()).toEqual([]);
    expect(isStorageCorrupt(REVIEWERS_KEY)).toBe(true);
    expect(storageCorruptionBackupKeys(REVIEWERS_KEY)).toHaveLength(1);
  });

  it("refuses to overwrite corrupt data on save", () => {
    localStorage.setItem(REVIEWERS_KEY, "{not json");
    getReviewers();
    expect(() => saveReviewer(reviewer())).toThrow(/corrupt/i);
    // The corrupt raw value is still there, not replaced by a fresh array.
    expect(localStorage.getItem(REVIEWERS_KEY)).toBe("{not json");
  });

  it("recovers after the flag is dismissed", () => {
    localStorage.setItem(REVIEWERS_KEY, "{not json");
    getReviewers();
    dismissStorageCorruption(REVIEWERS_KEY);
    localStorage.setItem(REVIEWERS_KEY, JSON.stringify([reviewer()]));
    expect(getReviewers()).toHaveLength(1);
    expect(isStorageCorrupt(REVIEWERS_KEY)).toBe(false);
  });
});

describe("quota errors", () => {
  it("surfaces a storage-full error instead of throwing DOMException", () => {
    saveReviewer(reviewer());
    const original = Storage.prototype.setItem;
    const quotaError = new DOMException("quota", "QuotaExceededError");
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw quotaError;
    });
    try {
      expect(() => saveReviewer(reviewer())).toThrow(/storage is full/i);
    } finally {
      Storage.prototype.setItem = original;
      vi.restoreAllMocks();
    }
  });
});
