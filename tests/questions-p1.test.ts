import { describe, expect, it } from "vitest";
import { isValidQuestionFields, shuffleOptions } from "@/app/lib/questions";

function base(overrides: Record<string, unknown> = {}) {
  return {
    type: "identification",
    question: "What is paging?",
    options: ["A", "B", "C", "D"],
    correctIndex: 0,
    source: "notes",
    ...overrides,
  };
}

describe("isValidQuestionFields option rules", () => {
  it("accepts 2–4 distinct non-empty options", () => {
    expect(isValidQuestionFields(base())).toBe(true);
    expect(isValidQuestionFields(base({ options: ["A", "B"], correctIndex: 1 }))).toBe(true);
  });

  it("rejects more than 4 options", () => {
    expect(isValidQuestionFields(base({ options: ["A", "B", "C", "D", "E"] }))).toBe(false);
  });

  it("rejects blank options", () => {
    expect(isValidQuestionFields(base({ options: ["A", "  ", "C", "D"] }))).toBe(false);
  });

  it("rejects duplicate options", () => {
    expect(isValidQuestionFields(base({ options: ["A", "a ", "C", "D"] }))).toBe(false);
  });

  it("rejects blank question text", () => {
    expect(isValidQuestionFields(base({ question: "   " }))).toBe(false);
  });
});

describe("shuffleOptions", () => {
  const seed = {
    id: "q1",
    type: "identification",
    question: "What is paging?",
    options: ["Option one", "Option two", "Option three", "Option four"],
    correctIndex: 1,
    source: "notes" as const,
  };

  it("always keeps the correct answer on the correct text", () => {
    for (let i = 0; i < 50; i++) {
      const shuffled = shuffleOptions({ ...seed, options: [...seed.options] });
      expect(shuffled.options[shuffled.correctIndex]).toBe("Option two");
      expect(shuffled.options).toHaveLength(4);
    }
  });

  it("actually moves the slot (not just claims to shuffle)", () => {
    const slots = new Set<number>();
    for (let i = 0; i < 50; i++) {
      slots.add(shuffleOptions({ ...seed, options: [...seed.options] }).correctIndex);
    }
    expect(slots.size).toBeGreaterThan(1);
  });
});
