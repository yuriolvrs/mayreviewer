import { describe, expect, it } from "vitest";
import { formatForLibrary, planReviewerFormat, reviewerFromSnapshot } from "@/app/lib/sharedImport";
import { getBuiltinFormats, OS_EXAM_ID } from "@/app/lib/examFormats";
import type { ExamFormat } from "@/app/lib/examFormats";
import type { ReviewerSnapshot } from "@/app/lib/shares";

const fmt: ExamFormat = {
  id: "custom-aaaa",
  name: "Mine",
  description: "",
  types: [{ key: "t1", label: "T", format: "mc", shape: "standalone", stimulus: "none", defaultCount: 3 }],
};
const snap: ReviewerSnapshot = {
  reviewerName: " OS ",
  subject: "Ops",
  topics: ["a"],
  examFormatId: "custom-aaaa",
  questionCount: 1,
  questionCountByType: {},
  questions: [
    { id: "q1", type: "t1", question: "Q?", options: ["a", "b"], correctIndex: 0, source: "notes" },
  ],
  format: fmt,
};
const builtins = getBuiltinFormats();

describe("planReviewerFormat", () => {
  it("saves embedded format under a fresh id", () => {
    const plan = planReviewerFormat(snap, builtins, [], () => "custom-new");
    expect(plan.formatId).toBe("custom-new");
    expect(plan.toSave?.id).toBe("custom-new");
  });
  it("reuses an equal local format, even under another id", () => {
    const plan = planReviewerFormat(snap, builtins, [{ ...fmt, id: "custom-zzzz" }], () => "x");
    expect(plan).toEqual({ formatId: "custom-zzzz" });
  });
  it("does not clobber a different local format with the same id", () => {
    const other = { ...fmt, name: "Other" };
    const plan = planReviewerFormat(snap, builtins, [other], () => "custom-new");
    expect(plan.formatId).toBe("custom-new");
  });
  it("keeps built-in ids and falls back to OS", () => {
    const noFmt = { ...snap, format: undefined };
    expect(planReviewerFormat({ ...noFmt, examFormatId: OS_EXAM_ID }, builtins, []).formatId).toBe(OS_EXAM_ID);
    expect(planReviewerFormat({ ...noFmt, examFormatId: "unknown" }, builtins, []).formatId).toBe(OS_EXAM_ID);
  });
});

describe("formatForLibrary", () => {
  it("assigns a new id and drops past exam", () => {
    const out = formatForLibrary({ ...fmt, pastExam: { fileName: "x", text: "t", addedAt: "" } }, () => "custom-n");
    expect(out.id).toBe("custom-n");
    expect(out.pastExam).toBeUndefined();
  });
});

describe("reviewerFromSnapshot", () => {
  it("builds a questions-only reviewer", () => {
    const r = reviewerFromSnapshot(snap, { id: "r9", formatId: "custom-new", now: "t" });
    expect(r.id).toBe("r9");
    expect(r.reviewerName).toBe("OS");
    expect(r.notes).toBe("");
    expect(r.projectMaterial).toBe("");
    expect(r.pastExamMaterial).toBe("");
    expect(r.examFormatId).toBe("custom-new");
    expect(r.questions).toHaveLength(1);
    expect(Object.values(r.questionCountByType).reduce((a, b) => a + b, 0)).toBe(1);
  });
});
