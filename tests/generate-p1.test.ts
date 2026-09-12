import { describe, expect, it } from "vitest";
import { sanitizeBlobName } from "@/app/lib/generate";

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
