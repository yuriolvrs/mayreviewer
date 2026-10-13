// Short-answer questions and formats survive an export/import round trip, and
// a malformed short question is rejected like any other bad question.
import { describe, expect, it } from "vitest";
import { parseReviewerFile } from "@/app/lib/reviewerFile";
import { isValidFormatDef, sanitizeFormatDef, shortAnswerKeys, standaloneKeys } from "@/app/lib/examFormats";

function jsonFile(data: unknown): File {
  return new File([JSON.stringify(data)], "reviewer.json", { type: "application/json" });
}

const shortQuestion = {
  id: "s1",
  type: "recall",
  question: "Why does paging avoid external fragmentation?",
  options: [],
  correctIndex: -1,
  source: "notes",
  answerKind: "short",
  modelAnswer: "Frames are fixed size, so any free frame fits any page.",
  keyPoints: ["Frames are fixed size", "Any free frame fits any page"],
};

const recallFormat = {
  id: "recall-format",
  name: "Recall",
  description: "",
  types: [
    { key: "recall", label: "Recall", format: "short-answer", shape: "standalone", stimulus: "none", defaultCount: 4 },
    { key: "pick", label: "Pick", format: "mc", shape: "standalone", stimulus: "none", defaultCount: 4 },
  ],
};

function reviewerJson(extra: Record<string, unknown> = {}) {
  return {
    reviewerName: "Imported",
    subject: "",
    topics: [],
    notes: "",
    projectMaterial: "",
    pastExamMaterial: "",
    questionCount: 8,
    questions: [shortQuestion],
    ...extra,
  };
}

describe("importing short-answer questions", () => {
  it("keeps the rubric and the format that defines the type", async () => {
    const result = await parseReviewerFile(jsonFile(reviewerJson({ format: recallFormat })));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.questions[0]).toMatchObject({
      answerKind: "short",
      options: [],
      keyPoints: ["Frames are fixed size", "Any free frame fits any page"],
    });
    expect(result.data.format?.types[0].format).toBe("short-answer");
  });

  it("rejects a short question that has no key points", async () => {
    const bad = { ...shortQuestion, keyPoints: [] };
    const result = await parseReviewerFile(jsonFile(reviewerJson({ questions: [bad] })));
    expect(result.ok).toBe(false);
  });
});

describe("short-answer format definitions", () => {
  it("accepts a standalone, no-stimulus short-answer type", () => {
    expect(isValidFormatDef(recallFormat)).toBe(true);
  });

  it("rejects a short-answer type declared as a set or with a stimulus", () => {
    const asSet = { ...recallFormat, types: [{ ...recallFormat.types[0], shape: "set" }] };
    const withStimulus = { ...recallFormat, types: [{ ...recallFormat.types[0], stimulus: "table" }] };
    expect(isValidFormatDef(asSet)).toBe(false);
    expect(isValidFormatDef(withStimulus)).toBe(false);
    expect(sanitizeFormatDef(asSet)).toBeUndefined();
  });

  it("splits short-answer keys out of the standalone choice keys", () => {
    const format = sanitizeFormatDef(recallFormat)!;
    expect(shortAnswerKeys(format)).toEqual(["recall"]);
    expect(standaloneKeys(format)).toEqual(["pick"]);
  });
});
