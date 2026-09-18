import { describe, expect, it } from "vitest";
import {
  formatCountdown,
  groupQuestions,
  isLowTime,
  isPreformatted,
  paceCalibrationFactor,
  isQuestion,
  isValidQuestionFields,
  missedIds,
  optionLetter,
  scoreTone,
  splitCountEvenly,
  dedupeQuestions,
  takeWithinBudget,
  takeWithinTypeBudget,
} from "@/app/lib/questions";
import type { Question, QuizAttempt } from "@/app/types";

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

  // Generated questions usually have 4 options, but a hand-written or
  // hand-edited one may have as few as 2 — rejecting those would silently
  // drop them on import. More than 4 is rejected: the renderer only knows
  // option letters A–D.
  it("accepts 2–4 options and rejects more", () => {
    expect(isValidQuestionFields(question({ options: ["A", "B"], correctIndex: 1 }))).toBe(true);
    expect(
      isValidQuestionFields(question({ options: ["A", "B", "C", "D", "E"], correctIndex: 4 })),
    ).toBe(false);
  });

  it("accepts a Modified True/False question with numbered statements", () => {
    expect(
      isValidQuestionFields(
        question({
          type: "modified-tf",
          question:
            "Which combination of statements is true?\n\n1. Deadlock needs all four Coffman conditions.\n2. Preemption can never fix a deadlock.",
          options: [
            "Statements 1 and 2 are true",
            "Only statement 1 is true",
            "All statements are true",
            "None of the statements are true",
          ],
          correctIndex: 1,
        }),
      ),
    ).toBe(true);
  });

  // Type keys are opaque strings validated for shape here; membership in a
  // format is enforced by the caller (generation filters by requested types,
  // imports validate against the embedded format).
  it("accepts any non-empty type key", () => {
    expect(
      isValidQuestionFields(question({ type: "vocab-7f3a" })),
    ).toBe(true);
  });
  it.each([
    ["null", null],
    ["a non-object", "nope"],
    ["an empty type", question({ type: "" })],
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

describe("formatCountdown", () => {
  it("renders m:ss, flooring partial seconds and clamping at zero", () => {
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(59)).toBe("0:59");
    expect(formatCountdown(59.9)).toBe("0:59");
    expect(formatCountdown(60)).toBe("1:00");
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(600)).toBe("10:00");
    expect(formatCountdown(-5)).toBe("0:00");
  });

  it("expands to h:mm:ss past an hour", () => {
    expect(formatCountdown(3599)).toBe("59:59");
    expect(formatCountdown(3600)).toBe("1:00:00");
    expect(formatCountdown(3661)).toBe("1:01:01");
  });
});

describe("isLowTime", () => {
  it("turns red only inside the last 10% of the budget", () => {
    expect(isLowTime(61, 600)).toBe(false);
    expect(isLowTime(60, 600)).toBe(true);
    expect(isLowTime(360, 3600)).toBe(true);
    expect(isLowTime(361, 3600)).toBe(false);
  });

  it("scales down to short budgets", () => {
    expect(isLowTime(13, 120)).toBe(false);
    expect(isLowTime(12, 120)).toBe(true);
  });
});

describe("paceCalibrationFactor", () => {
  const cost30 = () => 30;

  function attempt(overrides: Partial<QuizAttempt> = {}): QuizAttempt {
    return {
      id: "a1",
      reviewerId: "rv1",
      takenAt: "2026-09-18T10:00:00.000Z",
      score: 1,
      total: 2,
      questions: [question({ id: "q1" }), question({ id: "q2" })],
      answers: { q1: 1, q2: 0 },
      unsureIds: [],
      questionSetGeneratedAt: "2026-09-18T09:00:00.000Z",
      examFormatId: "csopesy-final",
      examFormatName: "CSOPESY Final",
      durationSec: 60,
      timedOut: false,
      ...overrides,
    };
  }

  it("returns null until three usable attempts exist", () => {
    expect(paceCalibrationFactor([], cost30)).toBeNull();
    expect(paceCalibrationFactor([attempt(), attempt()], cost30)).toBeNull();
    expect(
      paceCalibrationFactor([attempt(), attempt(), attempt()], cost30),
    ).toBe(1);
  });

  it("ignores backfilled zero-duration and empty attempts", () => {
    const attempts = [
      attempt({ durationSec: 0 }),
      attempt({ durationSec: undefined }),
      attempt({ questions: [] }),
      attempt({ durationSec: 180 }),
      attempt({ durationSec: 180 }),
      attempt({ durationSec: 180 }),
    ];
    // 3 usable × 60s predicted vs 3 × 180s actual.
    expect(paceCalibrationFactor(attempts, cost30)).toBe(3);
  });

  it("scales the prediction by the user's actual pace", () => {
    // Predicted 60s each, actually took 120s each: twice as slow.
    const attempts = [attempt({ durationSec: 120 }), attempt({ durationSec: 120 }), attempt({ durationSec: 120 })];
    expect(paceCalibrationFactor(attempts, cost30)).toBe(2);
  });

  it("uses the injected costs for the prediction", () => {
    const attempts = [attempt({ durationSec: 180 }), attempt({ durationSec: 180 }), attempt({ durationSec: 180 })];
    // Same attempts read as 90s-a-question predict 180s, matching actual.
    expect(paceCalibrationFactor(attempts, () => 90)).toBe(1);
  });

  it("clamps so one outlier can't warp every future estimate", () => {
    const slow = [attempt({ durationSec: 600 }), attempt({ durationSec: 600 }), attempt({ durationSec: 600 })];
    expect(paceCalibrationFactor(slow, cost30)).toBe(3);
    const fast = [attempt({ durationSec: 6 }), attempt({ durationSec: 6 }), attempt({ durationSec: 6 })];
    expect(paceCalibrationFactor(fast, cost30)).toBe(0.5);
  });
});

describe("isQuestion", () => {
  it("requires an id on top of the field checks", () => {
    // Delete through a loose record: id is required on Question, so a
    // rest-destructure would leave an unused binding behind.
    const withoutId: Record<string, unknown> = { ...question() };
    delete withoutId.id;
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
    // Modified True/False carries numbered statements, but they render as
    // normal prose with preserved line breaks — not a monospace block.
    expect(isPreformatted("modified-tf")).toBe(false);
  });

  it("labels options A-D", () => {
    expect([0, 1, 2, 3].map(optionLetter)).toEqual(["A", "B", "C", "D"]);
  });
});

describe("splitCountEvenly", () => {
  it("splits evenly across all five types", () => {
    expect(splitCountEvenly(10)).toEqual({
      identification: 2,
      scenario: 2,
      timeline: 2,
      code: 2,
      "modified-tf": 2,
    });
  });

  it("hands the remainder to the outermost types first", () => {
    expect(splitCountEvenly(7)).toEqual({
      identification: 2,
      scenario: 1,
      timeline: 1,
      code: 1,
      "modified-tf": 2,
    });
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

  // Observed in a real export: the same fact asked twice in one batch, differing
  // only in how the question was framed.
  it("drops a reframing of the same question", () => {
    const input = [
      question({
        id: "a",
        question:
          "What is the maximum number of user-defined variables that can be stored in the symbol table segment of a process?",
      }),
      question({
        id: "b",
        question:
          "In the context of the CSOPESY OS, what is the maximum number of variables that can be stored in the symbol table segment of a process?",
      }),
    ];
    expect(dedupeQuestions(input).map((q) => q.id)).toEqual(["a"]);
  });

  // The counterpart risk: two questions on one topic with different answers are
  // exactly what a regeneration is supposed to produce, so they have to survive.
  it("keeps two questions about one topic that test different facts", () => {
    const input = [
      question({ id: "a", question: "Which allocation strategy picks the smallest block that fits?" }),
      question({ id: "b", question: "Which allocation strategy picks the largest available block?" }),
    ];
    expect(dedupeQuestions(input)).toHaveLength(2);
  });

  it("keeps a short question that happens to share its few words", () => {
    const input = [
      question({ id: "a", question: "Define thrashing." }),
      question({ id: "b", question: "Define paging." }),
    ];
    expect(dedupeQuestions(input)).toHaveLength(2);
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
    "modified-tf": 0,
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

  // An oversized set is trimmed rather than dropped only when it would leave
  // the type with nothing — a Reviewer that asked for Timeline questions and
  // got zero because the one set ran a question long is the worse outcome.
  it("trims the only set of a type down to its budget", () => {
    const { kept } = takeWithinTypeBudget(timelineSet("a", 8), budget({ timeline: 5 }));
    expect(kept.map((q) => q.id)).toEqual(["a-0", "a-1", "a-2", "a-3", "a-4"]);
  });

  it("does not trim a set once the type already has questions", () => {
    const { kept } = takeWithinTypeBudget(
      [...timelineSet("small", 4), ...timelineSet("big", 9)],
      budget({ timeline: 6 }),
    );
    expect(kept.map((q) => q.groupId)).toEqual(Array(4).fill("small"));
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

describe("favorite", () => {
  it("accepts a starred question and one without the field", () => {
    expect(isValidQuestionFields(question({ favorite: true }))).toBe(true);
    expect(isValidQuestionFields(question({ favorite: false }))).toBe(true);
    expect(isValidQuestionFields(question())).toBe(true);
  });

  it("rejects a non-boolean favorite", () => {
    expect(isValidQuestionFields({ ...question(), favorite: "yes" })).toBe(false);
  });
});

describe("missedIds", () => {
  const pool = [
    question({ id: "q1", correctIndex: 0 }),
    question({ id: "q2", correctIndex: 1 }),
    question({ id: "q3", correctIndex: 2 }),
  ];

  it("returns wrong answers and blanks, in pool order", () => {
    expect(missedIds(pool, { q1: 0, q2: 0 })).toEqual(["q2", "q3"]);
  });

  it("returns [] for a perfect attempt", () => {
    expect(missedIds(pool, { q1: 0, q2: 1, q3: 2 })).toEqual([]);
  });
});
