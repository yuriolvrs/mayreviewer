import { describe, expect, it } from "vitest";
import { buildShareContent, customFormatFor } from "@/app/lib/shareInput";
import { getBuiltinFormats } from "@/app/lib/examFormats";
import type { ExamFormat } from "@/app/lib/examFormats";
import type { Reviewer } from "@/app/types";

const builtin = getBuiltinFormats()[0];
const custom = {
  id: "my-fmt",
  name: "Mine",
  description: "d",
  types: builtin.types,
  pastExam: { text: "secret" },
} as unknown as ExamFormat;
const reviewer = {
  id: "r1",
  reviewerName: "Bio",
  subject: "Biology",
  topics: [],
  examFormatId: "my-fmt",
  questionCount: 5,
  questionCountByType: {},
  questions: [],
} as unknown as Reviewer;

describe("shareInput", () => {
  it("never embeds a built-in format", () => {
    expect(customFormatFor([builtin, custom], builtin.id)).toBeUndefined();
    expect(customFormatFor([builtin, custom], "my-fmt")).toBe(custom);
  });

  it("derives reviewer fields and embeds the custom format without pastExam", () => {
    const c = buildShareContent({ kind: "reviewer", reviewer, customFormat: custom });
    expect(c).toMatchObject({
      kind: "reviewer",
      sourceId: "r1",
      title: "Bio",
      subject: "Biology",
      questionCount: 0,
    });
    const data = c.data as { format?: ExamFormat };
    expect(data.format?.id).toBe("my-fmt");
    expect(data.format?.pastExam).toBeUndefined();
  });

  it("derives format fields", () => {
    const c = buildShareContent({ kind: "format", format: custom });
    expect(c).toMatchObject({ kind: "format", sourceId: "my-fmt", title: "Mine", subject: "" });
    expect((c.data as ExamFormat).pastExam).toBeUndefined();
  });
});
