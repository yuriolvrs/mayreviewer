// The deterministic CPU-scheduling check: parse the process table, simulate,
// answer the question in code, and match it to an option. Retest repro: an OS
// Timeline set keyed "P3" for "running at time 7" when P2 is running.
import { describe, expect, it } from "vitest";
import type { Question } from "@/app/types";
import { scheduleCheck } from "@/app/lib/scheduleCheck";

const FCFS = "FCFS\n\nProcess | AT | BT\nP1 | 0 | 5\nP2 | 1 | 3\nP3 | 2 | 2";

function item(question: string, options: string[], correctIndex: number, overrides: Partial<Question> = {}): Question {
  return {
    id: "q",
    type: "timeline",
    question,
    options,
    correctIndex,
    source: "notes",
    groupId: "g",
    groupTitle: "FCFS Scheduling",
    stimulus: FCFS,
    explanation: "P1 finishes at 5, P2 runs from 5 to 8, so P3 runs after P2 finishes at 8.",
    ...overrides,
  };
}

describe("scheduleCheck: the FCFS retest set", () => {
  it("computes P2 for the item keyed P3", () => {
    const check = scheduleCheck(item("Which process is running at time 7?", ["P1", "P2", "P3", "None"], 2));
    expect(check?.computedIndex).toBe(1);
    expect(check?.explanation).toBe("Schedule: P1 0–5, P2 5–8, P3 8–10. At t = 7, P2 is running.");
  });

  it.each([
    ["At what time does P1 complete?", ["5", "6", "8", "10"], 0],
    ["What is the waiting time for P2?", ["1", "3", "4", "5"], 2],
    ["What is the completion order of the processes?", ["P1, P2, P3", "P1, P3, P2", "P2, P1, P3", "P3, P2, P1"], 0],
    ["What is the average waiting time for the processes?", ["2.33", "3.33", "4.33", "5.33"], 1],
  ])("agrees with the correct key for %s", (question, options, key) => {
    expect(scheduleCheck(item(question, options, key))?.computedIndex).toBe(key);
  });

  it("returns a null index when the answer is not among the options", () => {
    expect(scheduleCheck(item("What is the waiting time for P2?", ["1", "2", "3", "5"], 0))?.computedIndex).toBeNull();
  });

  it("answers turnaround time", () => {
    expect(scheduleCheck(item("What is the turnaround time of P3?", ["6", "7", "8", "10"], 0))?.computedIndex).toBe(2);
  });
});

describe("scheduleCheck: other algorithms", () => {
  const table = "Process | Arrival | Burst\nP1 | 0 | 5\nP2 | 1 | 3\nP3 | 2 | 1";

  it("Round Robin with q=2", () => {
    // P1 0-2, P2 2-4, P3 4-5, P1 5-7, P2 7-8, P1 8-9
    const q = (text: string, options: string[]) =>
      item(text, options, 0, { stimulus: `Round Robin (q=2)\n\n${table}`, groupTitle: "RR Scheduling" });
    expect(scheduleCheck(q("When does P3 complete?", ["5", "6", "7", "9"]))?.computedIndex).toBe(0);
    expect(
      scheduleCheck(q("What is the completion order?", ["P3, P2, P1", "P1, P2, P3", "P2, P3, P1", "P1, P3, P2"]))
        ?.computedIndex,
    ).toBe(0);
    expect(scheduleCheck(q("Which process is running at time 8?", ["P1", "P2", "P3", "None"]))?.computedIndex).toBe(0);
  });

  it("reads the quantum from the question", () => {
    const q = item("With a time quantum of 2, when does P3 complete?", ["5", "6", "7", "9"], 0, {
      stimulus: table,
      groupTitle: "Round Robin",
    });
    expect(scheduleCheck(q)?.computedIndex).toBe(0);
  });

  it("SRTF preempts on a shorter arrival", () => {
    // P2 (3) beats P1's remaining 4 at t=1; P3 (1) beats P2's remaining 2 at t=2.
    const q = item("Which process is running at time 2?", ["P1", "P2", "P3", "None"], 0, {
      stimulus: `SRTF\n\n${table}`,
      groupTitle: "Shortest Remaining Time First",
    });
    const check = scheduleCheck(q);
    expect(check?.computedIndex).toBe(2);
    expect(check?.explanation).toContain("P1 0–1, P2 1–2, P3 2–3, P2 3–5, P1 5–9");
  });

  it("treats 'preemptive SJF' as SRTF and plain SJF as non-preemptive", () => {
    const base = { stimulus: `SJF\n\n${table}`, groupTitle: "SJF" };
    const where = (q: Question) => scheduleCheck(q)?.computedIndex;
    const ask = (title: string) =>
      item("Which process is running at time 1?", ["P1", "P2", "P3", "None"], 0, { ...base, groupTitle: title });
    expect(where(ask("SJF (non-preemptive)"))).toBe(0);
    expect(where(ask("Preemptive SJF"))).toBe(1);
  });

  it("Priority, lower number first, non-preemptive", () => {
    const stimulus = "Priority Scheduling\n\nProcess | AT | BT | Priority\nP1 | 0 | 4 | 3\nP2 | 1 | 2 | 1\nP3 | 2 | 1 | 2";
    // P1 0-4, then P2 (prio 1) 4-6, P3 6-7
    const q = item("When does P3 complete?", ["5", "6", "7", "8"], 0, { stimulus, groupTitle: "Priority" });
    expect(scheduleCheck(q)?.computedIndex).toBe(2);
  });

  it("skips Priority when the table has no priority column", () => {
    const q = item("When does P3 complete?", ["5", "6", "7", "8"], 0, { stimulus: `Priority\n\n${table}` });
    expect(scheduleCheck(q)).toBeNull();
  });

  it("handles an idle gap", () => {
    const stimulus = "FCFS\n\nProcess | AT | BT\nP1 | 0 | 2\nP2 | 5 | 2";
    const q = (text: string, options: string[]) => item(text, options, 0, { stimulus });
    const idle = scheduleCheck(q("Which process is running at time 3?", ["P1", "P2", "CPU is idle", "Both"]));
    expect(idle?.computedIndex).toBe(2);
    expect(idle?.explanation).toBe("Schedule: P1 0–2, idle 2–5, P2 5–7. At t = 3, the CPU is idle.");
    expect(scheduleCheck(q("At what time does P2 complete?", ["4", "5", "7", "9"]))?.computedIndex).toBe(2);
    expect(scheduleCheck(q("What is the waiting time for P2?", ["0", "1", "2", "3"]))?.computedIndex).toBe(0);
  });
});

describe("scheduleCheck: no opinion", () => {
  it("returns null for an unparseable stimulus", () => {
    const q = item("Which process is running at time 7?", ["P1", "P2", "P3", "None"], 2, {
      stimulus: "FCFS\n\nGantt: |P1|P2|P3|",
    });
    expect(scheduleCheck(q)).toBeNull();
  });

  it("returns null for a table with unreadable numbers", () => {
    const q = item("When does P1 complete?", ["5", "6", "7", "8"], 0, { stimulus: "FCFS\n\nProcess | AT | BT\nP1 | 0 | five" });
    expect(scheduleCheck(q)).toBeNull();
  });

  it("returns null for an unrecognised question", () => {
    expect(scheduleCheck(item("Why is FCFS prone to the convoy effect?", ["a", "b", "c", "d"], 0))).toBeNull();
  });

  it("returns null when the algorithm is not named", () => {
    const q = item("When does P1 complete?", ["5", "6", "7", "8"], 0, {
      stimulus: "Process | AT | BT\nP1 | 0 | 5",
      groupTitle: "Scheduling",
    });
    expect(scheduleCheck(q)).toBeNull();
  });

  it("returns null without a stimulus", () => {
    expect(scheduleCheck(item("When does P1 complete?", ["5", "6", "7", "8"], 0, { stimulus: undefined }))).toBeNull();
  });
});
