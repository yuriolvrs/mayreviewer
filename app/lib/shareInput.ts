import { getBuiltinFormats } from "@/app/lib/examFormats";
import type { ExamFormat } from "@/app/lib/examFormats";
import { buildFormatSnapshot, buildReviewerSnapshot } from "@/app/lib/shares";
import type { UpsertShareInput } from "@/app/lib/shares";
import type { Reviewer } from "@/app/types";

export type ShareSource =
  | { kind: "reviewer"; reviewer: Reviewer; customFormat?: ExamFormat }
  | { kind: "format"; format: ExamFormat };

// Picks the custom format to embed. Built-in ids are never embedded.
export function customFormatFor(formats: ExamFormat[], formatId: string): ExamFormat | undefined {
  if (getBuiltinFormats().some((b) => b.id === formatId)) return undefined;
  return formats.find((f) => f.id === formatId);
}

// Share content only. `listed` and `showName` come from the dialog toggles.
export function buildShareContent(
  source: ShareSource,
): Omit<UpsertShareInput, "listed" | "showName"> {
  if (source.kind === "reviewer") {
    const { reviewer, customFormat } = source;
    return {
      kind: "reviewer",
      sourceId: reviewer.id,
      title: reviewer.reviewerName,
      subject: reviewer.subject,
      questionCount: reviewer.questions.length,
      data: buildReviewerSnapshot(reviewer, customFormat),
    };
  }
  const { format } = source;
  return {
    kind: "format",
    sourceId: format.id,
    title: format.name,
    subject: "",
    questionCount: 0,
    data: buildFormatSnapshot(format),
  };
}
