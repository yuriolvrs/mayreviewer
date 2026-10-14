import { describe, expect, it } from "vitest";
import {
  FILL_LABEL,
  generationView,
  monotonicPercent,
  sourcesText,
  stepStatus,
} from "@/app/lib/generationSteps";

describe("generationView", () => {
  it("starts in the upload step with no progress", () => {
    expect(generationView(null)).toEqual({ step: "upload", percent: 5, showFill: false });
  });

  it("maps source progress into 10 to 70 percent", () => {
    const p = (completed: number) =>
      generationView({ completed, total: 4, label: "notes" }).percent;
    expect(p(0)).toBe(10);
    expect(p(2)).toBe(40);
    expect(p(4)).toBe(70);
    expect(generationView({ completed: 1, total: 4, label: "x" }).step).toBe("write");
  });

  it("handles a zero total", () => {
    expect(generationView({ completed: 0, total: 0, label: "x" }).percent).toBe(10);
  });

  it("maps verify and fill stages", () => {
    expect(
      generationView({ completed: 0, total: 1, label: "Verifying answers", stage: "verify" }),
    ).toMatchObject({ step: "verify", percent: 70, showFill: false });
    expect(
      generationView({ completed: 0, total: 1, label: FILL_LABEL, stage: "verify" }),
    ).toMatchObject({ step: "fill", showFill: true });
  });
});

describe("monotonicPercent", () => {
  it("never goes backwards", () => {
    expect(monotonicPercent(70, 40)).toBe(70);
    expect(monotonicPercent(40, 70)).toBe(70);
  });
});

describe("stepStatus", () => {
  it("marks earlier steps done, current active, later pending", () => {
    expect(stepStatus("upload", "write", false)).toBe("done");
    expect(stepStatus("write", "write", false)).toBe("active");
    expect(stepStatus("verify", "write", false)).toBe("pending");
    expect(stepStatus("verify", "write", true)).toBe("done");
  });
});

describe("sourcesText", () => {
  it("uses singular and plural", () => {
    expect(sourcesText(0, 1)).toBe("0 of 1 source");
    expect(sourcesText(1, 3)).toBe("1 of 3 sources");
  });
});
