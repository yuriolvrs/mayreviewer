import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { parseReviewerFile } from "@/app/lib/reviewerFile";

function reviewerJson(extra: Record<string, unknown> = {}) {
  return {
    reviewerName: "Imported",
    subject: "",
    topics: [],
    notes: "",
    projectMaterial: "",
    pastExamMaterial: "",
    questionCount: 10,
    questions: [],
    ...extra,
  };
}

describe("parseReviewerFile past-exam manifests", () => {
  it("accepts pastexam-field entries from older exports", async () => {
    const bytes = strToU8("%PDF-1.4 fake");
    const data = reviewerJson({
      attachments: [
        { id: "a1", field: "pastexam", name: "midterm.pdf", mimeType: "application/pdf", path: "files/a1__midterm.pdf" },
      ],
    });
    const zipped = zipSync({ "reviewer.json": strToU8(JSON.stringify(data)), "files/a1__midterm.pdf": bytes });
    const file = new File([zipped.buffer as ArrayBuffer], "reviewer.zip", { type: "application/zip" });
    const result = await parseReviewerFile(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.attachments).toHaveLength(1);
      expect(result.data.skippedAttachments).toBe(0);
    }
  });

  it("rejects a .zip whose bytes lack the archive magic", async () => {
    const file = new File([JSON.stringify(reviewerJson())], "reviewer.zip", { type: "application/zip" });
    const result = await parseReviewerFile(file);
    expect(result).toEqual({ ok: false, error: "That file isn't a valid .zip archive." });
  });
});
