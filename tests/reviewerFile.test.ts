import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  MAX_IMPORT_FILE_BYTES,
  parseReviewerFile,
  sanitizeFilename,
} from "@/app/lib/reviewerFile";

function jsonFile(data: unknown, name = "reviewer.json"): File {
  return new File([JSON.stringify(data)], name, { type: "application/json" });
}

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

function zipFile(files: Record<string, Uint8Array>, name = "reviewer.zip"): File {
  const zipped = zipSync(files);
  return new File([zipped.buffer as ArrayBuffer], name, { type: "application/zip" });
}

describe("sanitizeFilename", () => {
  it("strips path separators and reserved characters", () => {
    expect(sanitizeFilename("a/b\\c:d*e?f")).toBe("a_b_c_d_e_f");
    const traversal = sanitizeFilename("../evil");
    expect(traversal).not.toContain("/");
    expect(traversal).not.toContain("\\");
  });

  it("falls back and caps length", () => {
    expect(sanitizeFilename("")).toBe("reviewer");
    expect(sanitizeFilename("   ")).toBe("reviewer");
    expect(sanitizeFilename("x".repeat(200)).length).toBeLessThanOrEqual(80);
  });
});

describe("parseReviewerFile size guards", () => {
  it("rejects files over the import size limit without reading them", async () => {
    const fake = {
      name: "big.json",
      size: MAX_IMPORT_FILE_BYTES + 1,
      text: async () => {
        throw new Error("must not be called");
      },
      arrayBuffer: async () => {
        throw new Error("must not be called");
      },
    } as unknown as File;
    const result = await parseReviewerFile(fake);
    expect(result.ok).toBe(false);
  });

  it("parses a plain JSON export", async () => {
    const result = await parseReviewerFile(jsonFile(reviewerJson()));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.reviewerName).toBe("Imported");
      expect(result.data.skippedAttachments).toBe(0);
    }
  });

  it("caps unbounded text fields from older exports", async () => {
    const result = await parseReviewerFile(jsonFile(reviewerJson({ notes: "n".repeat(300_000) })));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.notes.length).toBeLessThanOrEqual(200_000);
    }
  });
});

describe("parseReviewerFile manifest safety", () => {
  it("skips manifest entries with traversal paths", async () => {
    const data = reviewerJson({
      attachments: [
        { id: "a1", field: "notes", name: "evil.pdf", mimeType: "application/pdf", path: "../../evil" },
      ],
    });
    const zip = zipFile({ "reviewer.json": strToU8(JSON.stringify(data)) });
    const result = await parseReviewerFile(zip);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.attachments).toEqual([]);
      expect(result.data.skippedAttachments).toBe(1);
    }
  });

  it("counts manifest entries missing from the archive as skipped", async () => {
    const data = reviewerJson({
      attachments: [
        { id: "a1", field: "notes", name: "doc.pdf", mimeType: "application/pdf", path: "files/a1__doc.pdf" },
      ],
    });
    const zip = zipFile({ "reviewer.json": strToU8(JSON.stringify(data)) });
    const result = await parseReviewerFile(zip);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.attachments).toEqual([]);
      expect(result.data.skippedAttachments).toBe(1);
    }
  });

  it("keeps entries present in the archive", async () => {
    const bytes = strToU8("%PDF-1.4 fake");
    const data = reviewerJson({
      attachments: [
        { id: "a1", field: "notes", name: "doc.pdf", mimeType: "application/pdf", path: "files/a1__doc.pdf" },
      ],
    });
    const zip = zipFile({ "reviewer.json": strToU8(JSON.stringify(data)), "files/a1__doc.pdf": bytes });
    const result = await parseReviewerFile(zip);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.attachments).toHaveLength(1);
      expect(result.data.skippedAttachments).toBe(0);
    }
  });
});
