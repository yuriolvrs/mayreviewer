import { describe, expect, it } from "vitest";
import { distributeCount, planGeneration } from "@/app/lib/generationPlan";

describe("generationPlan guards", () => {
  it("distributeCount returns [] for zero sources instead of NaN", () => {
    expect(distributeCount(10, 0)).toEqual([]);
  });

  it("planGeneration returns [] for zero sources instead of throwing", () => {
    expect(planGeneration(10, 0, { identification: 10 })).toEqual([]);
  });

  it("planGeneration with a per-type mix never throws on empty slots", () => {
    expect(() => planGeneration(5, 1, { timeline: 5 }, [], 0, ["timeline"])).not.toThrow();
  });
});
