import { describe, expect, it } from "vitest";
import {
  groupQuestions,
  isPreformatted,
  isQuestion,
  isValidQuestionFields,
  optionLetter,
  scoreTone,
  dedupeQuestions,
  takeWithinBudget,
  takeWithinTypeBudget,
} from "@/app/lib/questions";
import type { Question } from "@/app/types";

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    type: "identification",
    question: "What is a semaphore?",
    options: ["A", "B", "C", "D"],
    correctIndex: 1,
    source: "notes",
    ...overrides,
  };
}

describe("isValidQuestionFields", () => {
  it("accepts a well-formed question", () => {
    expect(isValidQuestionFields(question())).toBe(true);
  });

  it("accepts the optional set fields when present", () => {
    expect(
      isValidQuestionFields(
        question({ groupId: "g1", groupTitle: "Round Robin", stimulus: "P1 ..." }),
      ),
    ).toBe(true);
  });

  // Generated questions always have 4 options (the response schema pins that),
  // but a hand-written or hand-edited one may have as few as 2 — rejecting
  // those would silently drop them on import.
  it("accepts option counts other than 4", () => {
    expect(isValidQuestionFields(question({ options: ["A", "B"], correctIndex: 1 }))).toBe(true);
    expect(
      isValidQuestionFields(question({ options: ["A", "B", "C", "D", "E"], correctIndex: 4 })),
    ).toBe(true);
  });

  // These are exactly the shapes that reached the question pool before the
  // importer and the API route shared one validator.
  it.each([
    ["null", null],
    ["a non-object", "nope"],
    ["an unknown type", question({ type: "essay" as Question["type"] })],
    ["an unknown source", question({ source: "web" as Question["source"] })],
    ["fewer than 2 options", question({ options: ["A"], correctIndex: 0 })],
    ["no options at all", question({ options: [] })],
    ["non-string options", question({ options: ["A", "B", "C", 4] as unknown as string[] })],
    ["a negative correctIndex", question({ correctIndex: -1 })],
    ["a correctIndex past the last option", question({ correctIndex: 4 })],
    ["a correctIndex past a short option list", question({ options: ["A", "B"], correctIndex: 2 })],
    ["a fractional correctIndex", question({ correctIndex: 1.5 })],
    ["a non-string question", question({ question: 42 as unknown as string })],
    ["a non-string stimulus", question({ stimulus: 42 as unknown as string })],
  ])("rejects %s", (_label, value) => {
    expect(isValidQuestionFields(value)).toBe(false);
  });
});

describe("isQuestion", () => {
  it("requires an id on top of the field checks", () => {
    const { id: _id, ...withoutId } = question();
    expect(isQuestion(withoutId)).toBe(false);
    expect(isQuestion(question())).toBe(true);
  });
});

describe("groupQuestions", () => {
  it("returns standalone questions as single-entry groups", () => {
    const groups = groupQuestions([question({ id: "a" }), question({ id: "b" })]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.questions.length)).toEqual([1, 1]);
    expect(groups[0].stimulus).toBeUndefined();
  });

  it("collapses contiguous questions sharing a groupId into one group", () => {
    const groups = groupQuestions([
      question({ id: "a", groupId: "set1", groupTitle: "SJF", stimulus: "table", type: "timeline" }),
      question({ id: "b", groupId: "set1", groupTitle: "SJF", stimulus: "table", type: "timeline" }),
      question({ id: "c" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].questions.map((q) => q.id)).toEqual(["a", "b"]);
    expect(groups[0].title).toBe("SJF");
    expect(groups[0].stimulus).toBe("table");
    expect(groups[1].questions.map((q) => q.id)).toEqual(["c"]);
  });

  // Grouping is contiguity-based, so a set split by an unrelated question
  // renders as two separate sets. Deleting a middle question in the Edit tab
  // is enough to cause this — documenting it rather than asserting it's fine.
  it("does not rejoin a set that has been split apart", () => {
    const groups = groupQuestions([
      question({ id: "a", groupId: "set1", stimulus: "table" }),
      question({ id: "b" }),
      question({ id: "c", groupId: "set1", stimulus: "table" }),
    ]);
    expect(groups).toHaveLength(3);
  });

  it("keeps every question exactly once", () => {
    const input = [
      question({ id: "a", groupId: "s", stimulus: "x" }),
      question({ id: "b", groupId: "s", stimulus: "x" }),
      question({ id: "c" }),
    ];
    expect(groupQuestions(input).flatMap((g) => g.questions)).toEqual(input);
  });
});

describe("presentation helpers", () => {
  it("treats timeline and code as preformatted", () => {
    expect(isPreformatted("timeline")).toBe(true);
    expect(isPreformatted("code")).toBe(true);
    expect(isPreformatted("identification")).toBe(false);
    expect(isPreformatted("scenario")).toBe(false);
  });

  it("labels options A-D", () => {
    expect([0, 1, 2, 3].map(optionLetter)).toEqual(["A", "B", "C", "D"]);
  });
});

describe("takeWithinBudget", () => {
  const standalone = (n: number) =>
    Array.from({ length: n }, (_, i) => question({ id: `s${i}` }));

  const set = (key: string, n: number) =>
    Array.from({ length: n }, (_, i) =>
      question({ id: `${key}-${i}`, type: "timeline", groupId: key, stimulus: "table" }),
    );

  it("passes everything through when it already fits", () => {
    expect(takeWithinBudget(standalone(4), 10)).toHaveLength(4);
  });

  it("trims standalone questions down to the budget", () => {
    expect(takeWithinBudget(standalone(12), 8)).toHaveLength(8);
  });

  it("returns nothing for a zero or negative budget", () => {
    expect(takeWithinBudget(standalone(5), 0)).toEqual([]);
    expect(takeWithinBudget(standalone(5), -3)).toEqual([]);
  });

  // The reported bug: 50 asked for, 60 delivered.
  it("never exceeds the budget when sets overshoot", () => {
    const overshoot = [...set("a", 10), ...standalone(6), ...set("b", 8)];
    expect(overshoot).toHaveLength(24);
    expect(takeWithinBudget(overshoot, 20)).toHaveLength(16);
  });

  it("keeps sets whole rather than delivering half a problem", () => {
    const kept = takeWithinBudget([...standalone(3), ...set("a", 6)], 7);
    // The set doesn't fit in the 4 remaining slots, so it's skipped entirely.
    expect(kept).toHaveLength(3);
    expect(kept.every((q) => q.groupId === undefined)).toBe(true);
  });

  it("skips an oversized set but still takes a later one that fits", () => {
    const kept = takeWithinBudget([...set("big", 9), ...set("small", 3)], 4);
    expect(kept.map((q) => q.groupId)).toEqual(["small", "small", "small"]);
  });

  // Dropping it would mean returning an empty batch, which is worse.
  it("truncates a single set that is larger than the whole budget", () => {
    const kept = takeWithinBudget(set("a", 10), 6);
    expect(kept).toHaveLength(6);
    expect(kept.every((q) => q.groupId === "a")).toBe(true);
  });

  it("keeps the questions it returns in their original order", () => {
    const input = [...standalone(2), ...set("a", 3)];
    expect(takeWithinBudget(input, 5).map((q) => q.id)).toEqual(input.map((q) => q.id));
  });
});

describe("scoreTone", () => {
  it.each([
    [0, "text-error"],
    [49, "text-error"],
    [50, "text-warning"],
    [79, "text-warning"],
    [80, "text-success"],
    [100, "text-success"],
  ])("maps %i%% to %s", (percent, tone) => {
    expect(scoreTone(percent)).toBe(tone);
  });
});

describe("dedupeQuestions", () => {
  it("keeps distinct questions untouched", () => {
    const input = [question({ id: "a", question: "What is a semaphore?" }), question({ id: "b", question: "What is a mutex?" })];
    expect(dedupeQuestions(input)).toHaveLength(2);
  });

  // Large counts are generated in several passes over the same material, so
  // the batches converge on the same obvious questions.
  it("drops a repeat of the same question text", () => {
    const input = [
      question({ id: "a", question: "What is a semaphore?" }),
      question({ id: "b", question: "What is a semaphore?" }),
    ];
    expect(dedupeQuestions(input).map((q) => q.id)).toEqual(["a"]);
  });

  it("ignores casing and whitespace differences", () => {
    const input = [
      question({ id: "a", question: "What is a semaphore?" }),
      question({ id: "b", question: "  what   is a SEMAPHORE?  " }),
    ];
    expect(dedupeQuestions(input)).toHaveLength(1);
  });

  it("treats a repeat with reshuffled options as a duplicate", () => {
    const input = [
      question({ id: "a", question: "Shortest next burst?", options: ["FCFS", "SJF", "RR", "P"], correctIndex: 1 }),
      question({ id: "b", question: "Shortest next burst?", options: ["SJF", "FCFS", "RR", "P"], correctIndex: 0 }),
    ];
    expect(dedupeQuestions(input)).toHaveLength(1);
  });

  // "Blank (3): what belongs here?" legitimately recurs across different code
  // listings — dropping it would gut the second listing's set.
  it("never drops questions belonging to a set", () => {
    const input = [
      question({ id: "a1", question: "Blank (1): what belongs here?", groupId: "set1", stimulus: "listing A" }),
      question({ id: "b1", question: "Blank (1): what belongs here?", groupId: "set2", stimulus: "listing B" }),
    ];
    expect(dedupeQuestions(input)).toHaveLength(2);
  });

  it("preserves the order of what it keeps", () => {
    const input = [
      question({ id: "a", question: "First?" }),
      question({ id: "b", question: "Second?" }),
      question({ id: "c", question: "First?" }),
      question({ id: "d", question: "Third?" }),
    ];
    expect(dedupeQuestions(input).map((q) => q.id)).toEqual(["a", "b", "d"]);
  });
});

describe("takeWithinTypeBudget", () => {
  const ident = (n: number, prefix = "i") =>
    Array.from({ length: n }, (_, i) => question({ id: `${prefix}${i}`, type: "identification" }));

  const scenario = (n: number) =>
    Array.from({ length: n }, (_, i) => question({ id: `sc${i}`, type: "scenario" }));

  const timelineSet = (key: string, n: number) =>
    Array.from({ length: n }, (_, i) =>
      question({ id: `${key}-${i}`, type: "timeline", groupId: key, stimulus: "table" }),
    );

  const budget = (over: Partial<Record<Question["type"], number>> = {}) => ({
    identification: 0,
    scenario: 0,
    timeline: 0,
    code: 0,
    ...over,
  });

  it("caps each type independently", () => {
    const { kept } = takeWithinTypeBudget(
      [...ident(8), ...scenario(8)],
      budget({ identification: 3, scenario: 5 }),
    );
    expect(kept.filter((q) => q.type === "identification")).toHaveLength(3);
    expect(kept.filter((q) => q.type === "scenario")).toHaveLength(5);
  });

  it("drops a type entirely when its budget is zero", () => {
    const { kept } = takeWithinTypeBudget(
      [...ident(4), ...scenario(4)],
      budget({ identification: 4 }),
    );
    expect(kept.every((q) => q.type === "identification")).toBe(true);
  });

  it("keeps a set whole or not at all", () => {
    const { kept } = takeWithinTypeBudget(timelineSet("a", 8), budget({ timeline: 5 }));
    expect(kept).toEqual([]);
  });

  it("takes a later set that fits after skipping an oversized one", () => {
    const { kept } = takeWithinTypeBudget(
      [...timelineSet("big", 9), ...timelineSet("small", 4)],
      budget({ timeline: 5 }),
    );
    expect(kept.map((q) => q.groupId)).toEqual(["small", "small", "small", "small"]);
  });

  // The budget is spent down across every source in one generation, so what
  // comes back has to be usable as the next call's ceiling.
  it("reports the budget left over", () => {
    const { remaining } = takeWithinTypeBudget(ident(2), budget({ identification: 5, scenario: 4 }));
    expect(remaining.identification).toBe(3);
    expect(remaining.scenario).toBe(4);
  });

  it("does not mutate the budget it was given", () => {
    const original = budget({ identification: 5 });
    takeWithinTypeBudget(ident(2), original);
    expect(original.identification).toBe(5);
  });

  it("keeps returned questions in their original order", () => {
    const input = [...ident(2), ...timelineSet("a", 3)];
    const { kept } = takeWithinTypeBudget(input, budget({ identification: 2, timeline: 3 }));
    expect(kept.map((q) => q.id)).toEqual(input.map((q) => q.id));
  });
});
