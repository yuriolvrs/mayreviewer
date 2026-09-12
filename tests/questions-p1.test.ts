import { describe, expect, it } from "vitest";
import {
  isValidQuestionFields,
  sampleProportionally,
  shuffleOptions,
  sumCounts,
  takeWithinBudget,
} from "@/app/lib/questions";
import type { Question } from "@/app/types";

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

  it("keeps the original order when correctIndex points nowhere", () => {
    const corrupt = { ...seed, options: [...seed.options], correctIndex: 9 };
    const result = shuffleOptions(corrupt);
    expect(result.options).toEqual(seed.options);
  });
});

describe("sumCounts", () => {
  it("ignores non-finite values instead of concatenating", () => {
    expect(sumCounts({ a: 2, b: 3 })).toBe(5);
    expect(sumCounts({ a: 2, b: "5" as unknown as number })).toBe(2);
    expect(sumCounts({ a: 2, b: NaN })).toBe(2);
  });
});

describe("sampleProportionally", () => {
  function pool(n: number): Question[] {
    return Array.from({ length: n }, (_, i) => ({
      id: `q${i}`,
      type: "identification",
      question: `q${i}?`,
      options: ["A", "B"],
      correctIndex: 0,
      source: "notes" as const,
    }));
  }

  it("returns a copy, not the live pool", () => {
    const p = pool(3);
    const out = sampleProportionally(p, 3);
    expect(out).toEqual(p);
    expect(out).not.toBe(p);
  });
});

describe("takeWithinBudget partial fill", () => {
  function standalone(id: string): Question {
    return {
      id,
      type: "identification",
      question: `${id}?`,
      options: ["A", "B"],
      correctIndex: 0,
      source: "notes",
    };
  }

  function setQuestion(id: string, groupId: string): Question {
    return { ...standalone(id), type: "code", groupId, stimulus: "listing" };
  }

  it("fills from a standalone question rather than slicing a set", () => {
    // Budget 1 with only an oversized set and one standalone available:
    // slicing the set would corrupt its blank numbering.
    const questions = [setQuestion("c1", "g"), setQuestion("c2", "g"), standalone("s1")];
    const out = takeWithinBudget(questions, 1);
    expect(out.map((q) => q.id)).toEqual(["s1"]);
  });
});
