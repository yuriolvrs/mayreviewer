import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { importedFormat, parseReviewerFile } from "@/app/lib/reviewerFile";
import { HISTORY, LEGACY_OS_EXAM_ID, MATH_101, OS_EXAM } from "@/app/lib/examFormats";

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

describe("importedFormat", () => {
  const custom = { ...HISTORY, id: "custom-e3a1b155", name: "HIST 120 midterm style" };

  it("keeps a built-in format's own id", () => {
    expect(importedFormat(MATH_101)).toEqual({ id: MATH_101.id });
  });

  it("maps the legacy built-in id onto the current one", () => {
    expect(importedFormat({ ...OS_EXAM, id: LEGACY_OS_EXAM_ID })).toEqual({ id: OS_EXAM.id });
  });

  it("returns a custom format so the caller can save it", () => {
    expect(importedFormat(custom)).toEqual({ id: custom.id, custom });
  });

  it("falls back to the OS exam only when the file has no format", () => {
    expect(importedFormat(undefined)).toEqual({ id: OS_EXAM.id });
  });
});

describe("parseReviewerFile format attachments", () => {
  function zipFile(data: unknown, files: Record<string, Uint8Array>) {
    const zipped = zipSync({ "reviewer.json": strToU8(JSON.stringify(data)), ...files });
    return new File([zipped.buffer as ArrayBuffer], "reviewer.zip", { type: "application/zip" });
  }

  it("parses format file entries and keeps them apart from reviewer files", async () => {
    const data = reviewerJson({
      attachments: [],
      formatAttachments: [
        { id: "f1", name: "past.pdf", mimeType: "application/pdf", path: "files/f1__past.pdf" },
      ],
    });
    const result = await parseReviewerFile(zipFile(data, { "files/f1__past.pdf": strToU8("%PDF") }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.attachments).toHaveLength(0);
      expect(result.data.formatAttachments).toHaveLength(1);
      expect(result.data.formatAttachments[0].name).toBe("past.pdf");
      expect(result.data.skippedAttachments).toBe(0);
    }
  });

  it("counts invalid or missing format entries as skipped", async () => {
    const data = reviewerJson({
      formatAttachments: [
        { id: "f1", name: "gone.pdf", mimeType: "application/pdf", path: "files/f1__gone.pdf" },
        { id: "f2", name: "bad.pdf", mimeType: "application/pdf", path: "../evil" },
        { id: "f3" },
      ],
    });
    const result = await parseReviewerFile(zipFile(data, {}));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.formatAttachments).toHaveLength(0);
      expect(result.data.skippedAttachments).toBe(3);
    }
  });

  it("imports older files without the new entries", async () => {
    const result = await parseReviewerFile(zipFile(reviewerJson({ attachments: [] }), {}));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.formatAttachments).toEqual([]);
      expect(result.data.skippedAttachments).toBe(0);
    }
  });
});
