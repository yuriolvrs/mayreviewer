import { describe, expect, it, vi } from "vitest";
import { parseAttachments } from "@/app/api/lib/attachments";

describe("parseAttachments validation", () => {
  it("rejects non-array bodies without fetching", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      expect(await parseAttachments("nope")).toEqual({ error: "`attachments` must be an array." });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("rejects off-store URLs (SSRF guard) without fetching", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const result = await parseAttachments([
        { name: "x.pdf", mimeType: "application/pdf", url: "https://evil.example/x.pdf", field: "notes" },
      ]);
      expect(result).toEqual({ error: "Attachment has an invalid file URL." });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("rejects Vercel-store URLs outside our upload paths", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const result = await parseAttachments([
        {
          name: "x.pdf",
          mimeType: "application/pdf",
          url: "https://abc.public.blob.vercel-storage.com/other/x.pdf",
          field: "notes",
        },
      ]);
      expect(result).toEqual({ error: "Attachment has an invalid file URL." });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("rejects unknown fields and bad mime types", async () => {
    expect(
      await parseAttachments([
        {
          name: "x.pdf",
          mimeType: "application/pdf",
          url: "https://abc.public.blob.vercel-storage.com/attachments/x.pdf",
          field: "nope",
        },
      ]),
    ).toEqual({ error: "Attachment has an unrecognised field." });
  });
});
