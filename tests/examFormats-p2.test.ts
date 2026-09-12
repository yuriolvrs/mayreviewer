import { describe, expect, it } from "vitest";
import { cloneFormat, MATH_101, newFormatId, newTypeKey } from "@/app/lib/examFormats";

describe("newTypeKey / newFormatId", () => {
  it("mints unique slug keys", () => {
    const keys = new Set(Array.from({ length: 100 }, () => newTypeKey("Vocabulary")));
    expect(keys.size).toBe(100);
    for (const k of keys) expect(k).toMatch(/^vocabulary-[a-z0-9]{6}$/);
  });

  it("falls back for empty labels", () => {
    expect(newTypeKey("")).toMatch(/^type-[a-z0-9]{6}$/);
  });

  it("mints unique custom format ids", () => {
    const ids = new Set(Array.from({ length: 100 }, () => newFormatId()));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id).toMatch(/^custom-[a-z0-9]{8}$/);
  });
});

describe("cloneFormat", () => {
  it("deep-copies examples so edits don't leak to the original", () => {
    const source = { ...MATH_101, types: MATH_101.types.map((t) => ({ ...t, examples: ["ex1"] })) };
    const copy = cloneFormat(source);
    const first = copy.types[0];
    expect(first?.examples).toEqual(["ex1"]);
    first?.examples?.push("ex2");
    expect(source.types[0]?.examples).toEqual(["ex1"]);
  });
});
