import { describe, expect, it } from "vitest";
import { sanitizeBlobName, sourceNames } from "@/app/lib/generate";

describe("sanitizeBlobName", () => {
  it("strips directory components", () => {
    expect(sanitizeBlobName("../../evil.pdf")).toBe("evil.pdf");
    expect(sanitizeBlobName("a\\b\\doc.pdf")).toBe("doc.pdf");
  });

  it("replaces unsafe characters and caps length", () => {
    expect(sanitizeBlobName("my doc (1).pdf")).toBe("my_doc_1_.pdf");
    expect(sanitizeBlobName("x".repeat(200)).length).toBeLessThanOrEqual(100);
  });

  it("falls back for empty names", () => {
    expect(sanitizeBlobName("")).toBe("file");
  });
});

describe("sourceNames", () => {
  const empty = { notes: "", projectMaterial: "", pastExamMaterial: "" };

  it("names a field that has only uploaded files", () => {
    expect(sourceNames(empty, ["notes"])).toEqual(["Notes"]);
  });

  it("names each field once, in field order, from text or files", () => {
    expect(
      sourceNames({ ...empty, pastExamMaterial: "Q1" }, ["pastexam", "project", "project"]),
    ).toEqual(["Project material", "Past exam"]);
  });

  it("names nothing when there is no text and no file", () => {
    expect(sourceNames({ ...empty, notes: "   " }, [])).toEqual([]);
  });
});
