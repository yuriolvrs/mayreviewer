import { describe, expect, it } from "vitest";
import { fitTextBudget } from "@/app/api/generate/route";

describe("fitTextBudget", () => {
  it("leaves small inputs untouched", () => {
    expect(fitTextBudget(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("caps the combined total, notes first", () => {
    const big = "x".repeat(60_000);
    const [notes, project, past] = fitTextBudget([big, big, big]);
    expect(notes.length + project.length + past.length).toBeLessThanOrEqual(100_000);
    expect(notes.length).toBe(60_000);
    expect(past.length).toBeLessThan(60_000);
  });

  it("handles empties", () => {
    expect(fitTextBudget(["", "", ""])).toEqual(["", "", ""]);
  });
});
