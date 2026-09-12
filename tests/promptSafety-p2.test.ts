import { describe, expect, it } from "vitest";
import { stripSpoofingControls } from "@/app/lib/promptSafety";

// Built from code points: invisible characters can't be typed literally.
const ZWSP = String.fromCodePoint(0x200b);

describe("stripSpoofingControls zero-width space", () => {
  it("strips U+200B, which has no visible role", () => {
    expect(stripSpoofingControls(`a${ZWSP}b`)).toBe("ab");
  });

  it("keeps newlines, tabs, and visible text", () => {
    expect(stripSpoofingControls("line1\nline2\ttab")).toBe("line1\nline2\ttab");
  });
});
