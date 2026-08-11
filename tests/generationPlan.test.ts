import { describe, expect, it } from "vitest";
import { MIN_SET_SIZE, planGeneration } from "@/app/lib/generationPlan";
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
