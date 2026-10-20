// The deterministic half of the answer check: an item whose own explanation
// shows scratch work, or lands on a value other than the keyed option, can't
// be trusted whatever the model verifier says about it.
import { describe, expect, it } from "vitest";
import type { Question } from "@/app/types";
import { keyConflict } from "@/app/lib/answerCheck";

function mc(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    type: "scenario",
    question: "Under FCFS, what is the average waiting time for P1 (burst 3), P2 (burst 4), P3 (burst 3)?",
    options: ["2.33 ms", "3.33 ms", "4.00 ms", "5.00 ms"],
    correctIndex: 1,
    source: "notes",
    explanation: "Waiting times are 0, 3 and 7, so the average is (0 + 3 + 7) / 3 = 3.33 ms.",
    whyOthersWrong: "The other values come from using burst times instead of start times.",
    ...overrides,
  };
}

describe("keyConflict: self-correction", () => {
  it("passes a clean explanation", () => {
    expect(keyConflict(mc())).toBeNull();
  });

  it('flags the retest repro ("? Wait:")', () => {
    const q = mc({ explanation: "Average is 12/3 = 4.0? Wait: 0+5+7=12." });
    expect(keyConflict(q)).toBe("self-correction");
  });

  it('passes OS prose like "P2 must wait."', () => {
    const q = mc({ explanation: "P2 must wait. Waiting times are 0, 3 and 7, so (0 + 3 + 7) / 3 = 3.33 ms." });
    expect(keyConflict(q)).toBeNull();
  });

  it("flags the usability-test repro (scratch work in the explanation)", () => {
    const q = mc({
      correctIndex: 0,
      explanation:
        "P1 waits 0, P2 waits 3, P3 waits 7. Average = 10/3 = 3.33. Wait, calculating again… Wait, checking calculation, the average is 2.33.",
    });
    expect(keyConflict(q)).toBe("self-correction");
  });

  it.each([
    "Wait, the order is P2 first, so the answer is 3.33 ms.",
    "Recalculating with the correct arrival times gives 3.33 ms.",
    "After re-calculating, the average is 3.33 ms.",
    "Checking the calculation again, the average is 3.33 ms.",
    "Let me check: (0 + 3 + 7) / 3 = 3.33 ms.",
    "Hmm, (0 + 3 + 7) / 3 = 3.33 ms.",
    "Oops, (0 + 3 + 7) / 3 = 3.33 ms.",
    "On second thought, (0 + 3 + 7) / 3 = 3.33 ms.",
    "I made a mistake earlier; (0 + 3 + 7) / 3 = 3.33 ms.",
  ])("flags %j", (explanation) => {
    expect(keyConflict(mc({ explanation }))).toBe("self-correction");
  });

  it("also reads whyOthersWrong", () => {
    expect(keyConflict(mc({ whyOthersWrong: "Wait, option A is also close." }))).toBe("self-correction");
  });

  // "wait" is ordinary vocabulary in an OS course.
  it.each([
    "P2 must wait. The average waiting time is (0 + 3 + 7) / 3 = 3.33 ms.",
    "The parent calls wait(), so the average is (0 + 3 + 7) / 3 = 3.33 ms.",
    "Each process waits for the one before it: (0 + 3 + 7) / 3 = 3.33 ms.",
  ])("does not flag OS use of wait: %j", (explanation) => {
    expect(keyConflict(mc({ explanation }))).toBeNull();
  });

  it("checks short answers too", () => {
    const q = mc({
      options: [],
      correctIndex: -1,
      answerKind: "short",
      modelAnswer: "Paging avoids external fragmentation. Wait, it also needs a page table.",
      keyPoints: ["Avoids external fragmentation"],
      explanation: undefined,
      whyOthersWrong: undefined,
    });
    expect(keyConflict(q)).toBe("self-correction");
  });
});

describe("keyConflict: final value", () => {
  it("flags an explanation whose final value is another option", () => {
    expect(keyConflict(mc({ correctIndex: 0 }))).toBe("final-value");
  });

  it("flags an explanation whose final value is no option at all", () => {
    const q = mc({
      options: ["2.33 ms", "4.00 ms", "5.00 ms", "6.00 ms"],
      correctIndex: 0,
    });
    expect(keyConflict(q)).toBe("final-value");
  });

  it("passes when the final value matches the key", () => {
    expect(keyConflict(mc())).toBeNull();
  });

  it("tolerates rounding between explanation and option", () => {
    expect(keyConflict(mc({ explanation: "The average is 10 / 3 = 3.333 ms." }))).toBeNull();
  });

  it("uses the value after the last = rather than a trailing count", () => {
    const q = mc({ explanation: "Total waiting = 10 ms; 10 / 3 = 3.33 ms across 3 processes." });
    expect(keyConflict(q)).toBeNull();
  });

  it("ignores digits inside names like P1", () => {
    const q = mc({ explanation: "The average is 3.33 ms, set by P3" });
    expect(keyConflict(q)).toBeNull();
  });

  it("skips options that are not single numbers", () => {
    const q = mc({
      options: ["P1, P2, P3", "P2, P1, P3", "P3, P2, P1", "P1, P3, P2"],
      correctIndex: 2,
      explanation: "P3 has the shortest burst of 1 ms, so it runs first.",
    });
    expect(keyConflict(q)).toBeNull();
  });

  it("skips explanations with no number", () => {
    expect(keyConflict(mc({ explanation: "FCFS runs processes in arrival order." }))).toBeNull();
  });
});
