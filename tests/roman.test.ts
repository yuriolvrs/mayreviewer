import { describe, expect, it } from "vitest";
import { toRoman } from "@/app/lib/roman";

describe("toRoman", () => {
  it("converts badge levels", () => {
    expect([1, 2, 3, 4, 5, 6, 8, 9, 10].map(toRoman)).toEqual([
      "I",
      "II",
      "III",
      "IV",
      "V",
      "VI",
      "VIII",
      "IX",
      "X",
    ]);
  });
});
