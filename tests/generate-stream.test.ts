import { describe, expect, it } from "vitest";
import { parseStreamLine } from "@/app/lib/generate";

describe("parseStreamLine", () => {
  it("parses a progress message", () => {
    const line = JSON.stringify({ type: "progress", phase: "done", label: "notes", completed: 1, total: 2 });
    expect(parseStreamLine(line)).toEqual(JSON.parse(line));
  });

  it("parses a done message", () => {
    const line = JSON.stringify({ type: "done", questions: [], failures: [], verified: { corrected: 0, dropped: 0 } });
    expect(parseStreamLine(line)).not.toBeNull();
  });

  it("returns null for blank lines", () => {
    expect(parseStreamLine("")).toBeNull();
    expect(parseStreamLine("   ")).toBeNull();
  });

  // A truncated chunk mid-stream must be skipped, not throw and kill the run.
  it("returns null for corrupt JSON instead of throwing", () => {
    expect(parseStreamLine('{"type":"progress","phase":')).toBeNull();
    expect(parseStreamLine("not json at all")).toBeNull();
  });
});
