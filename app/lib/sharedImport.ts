import { canonicalFormatId, newFormatId, OS_EXAM_ID } from "@/app/lib/examFormats";
import type { ExamFormat } from "@/app/lib/examFormats";
import { splitCountEvenly } from "@/app/lib/questions";
import type { ReviewerSnapshot } from "@/app/lib/shares";
import type { Reviewer } from "@/app/types";

// Pure helpers for adding a share to the local library. The page does the
// storage writes; these decide what to write.

function sameFormatContent(a: ExamFormat, b: ExamFormat): boolean {
  const strip = (f: ExamFormat) => {
    const { id: _id, updatedAt: _updatedAt, pastExam: _pastExam, ...rest } = f;
    void _id;
    void _updatedAt;
    void _pastExam;
    return JSON.stringify(rest);
  };
  return strip(a) === strip(b);
}

export type FormatImportPlan = {
  formatId: string;
  // Set when the format must be written to the library.
  toSave?: ExamFormat;
};

// Decides which format id a shared reviewer ends up on.
// - Built-in ids are kept (never overwritten).
// - An equal local format is reused.
// - Otherwise the embedded format is saved under a fresh id.
// - No usable format falls back to the Operating Systems built-in.
export function planReviewerFormat(
  snapshot: ReviewerSnapshot,
  builtins: ExamFormat[],
  customs: ExamFormat[],
  makeId: () => string = newFormatId,
): FormatImportPlan {
  const isBuiltin = (id: string) => builtins.some((f) => f.id === canonicalFormatId(id));
  const embedded = snapshot.format;
  if (!embedded) {
    const id = canonicalFormatId(snapshot.examFormatId);
    if (id && isBuiltin(id)) return { formatId: id };
    const custom = customs.find((f) => f.id === snapshot.examFormatId);
    return { formatId: custom ? custom.id : OS_EXAM_ID };
  }
  if (isBuiltin(embedded.id)) return { formatId: canonicalFormatId(embedded.id) };
  const existing = [...builtins, ...customs].find((f) => sameFormatContent(f, embedded));
  if (existing) return { formatId: existing.id };
  const id = makeId();
  return { formatId: id, toSave: { ...embedded, id } };
}

// A shared format always gets a new id so it never overwrites a local one.
export function formatForLibrary(format: ExamFormat, makeId: () => string = newFormatId): ExamFormat {
  const { pastExam: _pastExam, updatedAt: _updatedAt, ...rest } = format;
  void _pastExam;
  void _updatedAt;
  return { ...rest, id: makeId() };
}

// Questions only: notes, material and attachments start empty.
export function reviewerFromSnapshot(
  snapshot: ReviewerSnapshot,
  opts: { id: string; formatId: string; now: string },
): Reviewer {
  const count = snapshot.questionCount;
  return {
    id: opts.id,
    reviewerName: snapshot.reviewerName.trim(),
    subject: snapshot.subject.trim(),
    topics: snapshot.topics,
    notes: "",
    projectMaterial: "",
    pastExamMaterial: "",
    examFormatId: opts.formatId,
    questionCount: count,
    questionCountByType:
      Object.keys(snapshot.questionCountByType).length > 0
        ? snapshot.questionCountByType
        : splitCountEvenly(count),
    questions: snapshot.questions,
    createdAt: opts.now,
    updatedAt: opts.now,
    questionsGeneratedAt: opts.now,
  };
}
