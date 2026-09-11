import { describe, expect, it } from "vitest";
import {
  HEIC_GUIDANCE,
  isHeicFile,
  sniffAttachmentKind,
} from "@/app/lib/attachmentLimits";

const bytes = (arr: number[]) => new Uint8Array(arr);

describe("sniffAttachmentKind", () => {
  it("recognizes a PDF by its magic bytes, not its claimed type", () => {
    expect(sniffAttachmentKind(bytes([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]))).toBe("pdf");
  });

  it("recognizes JPEG, PNG, and WebP photos", () => {
    expect(sniffAttachmentKind(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image");
    expect(
      sniffAttachmentKind(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe("image");
    expect(
      sniffAttachmentKind(
        bytes([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]),
      ),
    ).toBe("image");
  });

  it("flags HEIC separately so the caller can explain instead of just rejecting", () => {
    // ftyp box + heic brand.
    const heic = bytes([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
    expect(sniffAttachmentKind(heic)).toBe("heic");
    expect(HEIC_GUIDANCE.length).toBeGreaterThan(0);
  });

  it("calls anything else unknown", () => {
    expect(sniffAttachmentKind(bytes([0x50, 0x4b, 0x03, 0x04]))).toBe("unknown");
    expect(sniffAttachmentKind(bytes([]))).toBe("unknown");
  });
});

describe("isHeicFile", () => {
  it("catches HEIC by extension or mime before any bytes are read", () => {
    expect(isHeicFile("photo.HEIC", "")).toBe(true);
    expect(isHeicFile("photo.heif", "")).toBe(true);
    expect(isHeicFile("photo.jpg", "image/heic")).toBe(true);
    expect(isHeicFile("photo.jpg", "image/jpeg")).toBe(false);
    expect(isHeicFile("notes.pdf", "application/pdf")).toBe(false);
  });
});
