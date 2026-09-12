import { describe, expect, it } from "vitest";
import { newId } from "@/app/lib/ids";

describe("newId", () => {
  it("returns a non-empty string", () => {
    expect(typeof newId()).toBe("string");
    expect(newId().length).toBeGreaterThan(0);
  });

  it("mints unique values", () => {
    const ids = new Set(Array.from({ length: 100 }, () => newId()));
    expect(ids.size).toBe(100);
  });

  it("falls back when crypto.randomUUID is missing", () => {
    const cryptoObj = globalThis.crypto as Crypto & { randomUUID?: unknown };
    const original = cryptoObj?.randomUUID;
    try {
      if (cryptoObj) {
        // @ts-expect-error simulating an old browser without randomUUID
        cryptoObj.randomUUID = undefined;
      }
      const id = newId();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    } finally {
      if (cryptoObj && original) cryptoObj.randomUUID = original;
    }
  });
});
