import { describe, expect, it } from "vitest";
import { MIN_SET_SIZE, dealTopics, planGeneration } from "@/app/lib/generationPlan";
import { QUESTION_TYPES } from "@/app/lib/questions";
import type { QuestionType } from "@/app/types";

const mix = (over: Partial<Record<QuestionType, number>> = {}) => ({
  identification: 0,
  scenario: 0,
  timeline: 0,
  code: 0,
  ...over,
});

const chunks = (plan: ReturnType<typeof planGeneration>) => plan.flat();

const totalOf = (plan: ReturnType<typeof planGeneration>, type: QuestionType) =>
  chunks(plan).reduce((sum, c) => sum + (c.typeCounts?.[type] ?? 0), 0);

describe("planGeneration", () => {
  it("carries a total per chunk and no mix when none was requested", () => {
    const plan = planGeneration(50, 1);
    expect(plan).toHaveLength(1);
    expect(plan[0].map((c) => c.count)).toEqual([25, 25]);
    expect(plan[0].every((c) => c.typeCounts === undefined)).toBe(true);
  });

  it("splits a source's share across calls and one plan per source", () => {
    const plan = planGeneration(90, 2);
    expect(plan.map((forJob) => forJob.map((c) => c.count))).toEqual([
      [23, 22],
      [23, 22],
    ]);
  });

  // The reported bug: 15/15/10/10 came back as 15 Identification, 15 Scenario
  // and nothing else, because each chunk was asked for a rescaled 3-5 Timeline
  // questions — fewer than a problem set can hold.
  it("keeps every type's target intact across the whole request", () => {
    for (const sources of [1, 2, 3, 4]) {
      const plan = planGeneration(50, sources, mix({ identification: 15, scenario: 15, timeline: 10, code: 10 }));
      expect(totalOf(plan, "identification")).toBe(15);
      expect(totalOf(plan, "scenario")).toBe(15);
      expect(totalOf(plan, "timeline")).toBe(10);
      expect(totalOf(plan, "code")).toBe(10);
    }
  });

  it("gives a set type's whole target to one call rather than a slice each", () => {
    const plan = planGeneration(50, 3, mix({ identification: 15, scenario: 15, timeline: 10, code: 10 }));
    for (const type of ["timeline", "code"] as QuestionType[]) {
      const carrying = chunks(plan).filter((c) => (c.typeCounts?.[type] ?? 0) > 0);
      expect(carrying).toHaveLength(1);
      expect(carrying[0].typeCounts?.[type]).toBe(10);
    }
  });

  it("never asks one call for a partial set when the target could fill one", () => {
    const plan = planGeneration(120, 3, mix({ identification: 40, scenario: 40, timeline: 20, code: 20 }));
    for (const chunk of chunks(plan)) {
      for (const type of ["timeline", "code"] as QuestionType[]) {
        const n = chunk.typeCounts?.[type] ?? 0;
        expect(n === 0 || n >= MIN_SET_SIZE).toBe(true);
      }
    }
  });

  it("states a count that matches the mix it hands the same chunk", () => {
    const plan = planGeneration(37, 2, mix({ identification: 12, scenario: 10, timeline: 8, code: 7 }));
    for (const chunk of chunks(plan)) {
      const summed = QUESTION_TYPES.reduce((sum, t) => sum + (chunk.typeCounts?.[t] ?? 0), 0);
      expect(chunk.count).toBe(summed);
    }
  });

  // Sources are floored at one question each, so they can be offered more room
  // than the request has questions to fill.
  it("plans an empty call rather than padding when there are more sources than questions", () => {
    const plan = planGeneration(2, 3, mix({ identification: 1, scenario: 1 }));
    expect(chunks(plan).filter((c) => c.count > 0)).toHaveLength(2);
    expect(totalOf(plan, "identification")).toBe(1);
    expect(totalOf(plan, "scenario")).toBe(1);
  });

  it("drops a type asked for zero of", () => {
    const plan = planGeneration(20, 2, mix({ identification: 10, timeline: 10 }));
    expect(totalOf(plan, "scenario")).toBe(0);
    expect(totalOf(plan, "code")).toBe(0);
    expect(totalOf(plan, "timeline")).toBe(10);
  });
});

describe("dealTopics", () => {
  const topics = ["A", "B", "C", "D"];

  it("splits the budget evenly when it divides", () => {
    expect(dealTopics(topics, 8, 0)).toEqual([
      { topic: "A", count: 2 },
      { topic: "B", count: 2 },
      { topic: "C", count: 2 },
      { topic: "D", count: 2 },
    ]);
  });

  it("hands the remainder to whichever topics the rotation starts on", () => {
    expect(dealTopics(topics, 6, 0).filter((t) => t.count === 2).map((t) => t.topic)).toEqual(["A", "B"]);
    expect(dealTopics(topics, 6, 2).filter((t) => t.count === 2).map((t) => t.topic)).toEqual(["C", "D"]);
  });

  // The reported problem: some topics were never asked about across several
  // regenerations. A budget smaller than the topic list can't cover them all in
  // one run, so the rotation has to move which ones it covers.
  it("covers different topics per rotation when the budget can't reach them all", () => {
    expect(dealTopics(topics, 2, 0).map((t) => t.topic)).toEqual(["A", "B"]);
    expect(dealTopics(topics, 2, 2).map((t) => t.topic)).toEqual(["C", "D"]);
  });

  it("gives every topic a share whenever the budget is large enough", () => {
    for (const rotation of [0, 1, 2, 3, 7]) {
      const dealt = dealTopics(topics, 12, rotation);
      expect(dealt.map((t) => t.topic).sort()).toEqual(topics);
      expect(dealt.every((t) => t.count === 3)).toBe(true);
    }
  });

  it("never emits a topic with a zero target", () => {
    expect(dealTopics(topics, 1, 0)).toEqual([{ topic: "A", count: 1 }]);
  });

  it("returns nothing without topics or budget", () => {
    expect(dealTopics([], 10, 0)).toEqual([]);
    expect(dealTopics(topics, 0, 0)).toEqual([]);
  });

  it("takes a rotation past the end of the list, or before it", () => {
    expect(dealTopics(topics, 4, 5)).toEqual(dealTopics(topics, 4, 1));
    expect(dealTopics(topics, 4, -1)).toEqual(dealTopics(topics, 4, 3));
  });
});

describe("planGeneration topics", () => {
  const topics = ["Scheduling", "Memory", "Sync", "Structures"];

  it("deals topics against each chunk's standalone budget only", () => {
    // Set questions can't be spread over a topic list — a scheduling trace
    // isn't answerable as a synchronisation question.
    const plan = planGeneration(40, 1, mix({ identification: 10, scenario: 10, timeline: 10, code: 10 }), topics);
    for (const chunk of chunks(plan)) {
      const standalone = (chunk.typeCounts?.identification ?? 0) + (chunk.typeCounts?.scenario ?? 0);
      const dealt = (chunk.topics ?? []).reduce((sum, t) => sum + t.count, 0);
      expect(dealt).toBe(standalone);
    }
  });

  it("gives every topic a share of a single-chunk request", () => {
    const plan = planGeneration(30, 1, mix({ identification: 15, scenario: 15 }), topics);
    expect(plan[0]).toHaveLength(1);
    expect((plan[0][0].topics ?? []).map((t) => t.topic).sort()).toEqual([...topics].sort());
  });

  it("advances the rotation per chunk so two chunks don't lead with the same topic", () => {
    const plan = planGeneration(80, 1, mix({ identification: 40, scenario: 40 }), topics);
    const leads = chunks(plan).map((c) => c.topics?.[0]?.topic);
    expect(leads).toHaveLength(2);
    expect(new Set(leads).size).toBe(2);
  });

  it("carries topics on the no-mix path too", () => {
    const plan = planGeneration(20, 1, undefined, topics);
    expect((plan[0][0].topics ?? []).reduce((sum, t) => sum + t.count, 0)).toBe(20);
  });

  it("leaves topics empty when the reviewer named none", () => {
    const plan = planGeneration(20, 1, mix({ identification: 20 }));
    expect(chunks(plan).every((c) => c.topics?.length === 0)).toBe(true);
  });
});
