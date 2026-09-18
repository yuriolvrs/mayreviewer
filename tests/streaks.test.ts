import { describe, expect, it } from "vitest";
import { computeStreak, dayKey, shiftDay, todayProgress } from "@/app/lib/streaks";

// Midday local times throughout: ISO round-trips stay on the same local day
// in any timezone, so these hold everywhere.
const NOON = (day: number) => new Date(2026, 8, day, 12, 0, 0);
const ISO = (day: number) => NOON(day).toISOString();
const NOW = NOON(18);

describe("dayKey", () => {
  it("formats local calendar parts with padding", () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(dayKey(NOON(18))).toBe("2026-09-18");
  });
});

describe("shiftDay", () => {
  it("steps across month boundaries", () => {
    expect(shiftDay("2026-09-18", -1)).toBe("2026-09-17");
    expect(shiftDay("2026-09-01", -1)).toBe("2026-08-31");
    expect(shiftDay("2026-09-18", 1)).toBe("2026-09-19");
  });
});

describe("computeStreak", () => {
  it("is zero with no history", () => {
    expect(computeStreak([], NOW)).toEqual({ count: 0, todayDone: false });
  });

  it("counts consecutive days ending today", () => {
    expect(computeStreak([ISO(18)], NOW)).toEqual({ count: 1, todayDone: true });
    expect(computeStreak([ISO(16), ISO(17), ISO(18)], NOW)).toEqual({ count: 3, todayDone: true });
  });

  it("stays alive on yesterday alone, with today pending", () => {
    expect(computeStreak([ISO(17)], NOW)).toEqual({ count: 1, todayDone: false });
  });

  it("breaks on a gap and counts only the current run", () => {
    expect(computeStreak([ISO(15), ISO(18)], NOW)).toEqual({ count: 1, todayDone: true });
    expect(computeStreak([ISO(10), ISO(11), ISO(17)], NOW)).toEqual({ count: 1, todayDone: false });
  });

  it("is zero when the last activity is older than yesterday", () => {
    expect(computeStreak([ISO(16)], NOW)).toEqual({ count: 0, todayDone: false });
  });

  it("ignores future and unparseable stamps", () => {
    expect(computeStreak([ISO(25), "not-a-date", ""], NOW)).toEqual({ count: 0, todayDone: false });
    expect(computeStreak([ISO(17), ISO(25), "junk"], NOW)).toEqual({ count: 1, todayDone: false });
  });

  it("dedupes multiple attempts on one day", () => {
    expect(computeStreak([ISO(18), ISO(18), ISO(17)], NOW)).toEqual({ count: 2, todayDone: true });
  });
});

describe("todayProgress", () => {
  it("sums today's attempt totals and flags goal completion", () => {
    const attempts = [
      { takenAt: ISO(18), total: 6 },
      { takenAt: ISO(18), total: 5 },
      { takenAt: ISO(17), total: 20 },
    ];
    expect(todayProgress(attempts, 10, NOW)).toEqual({ answered: 11, goal: 10, done: true });
    expect(todayProgress(attempts, 20, NOW)).toEqual({ answered: 11, goal: 20, done: false });
  });

  it("is zero with no attempts today and skips bad stamps", () => {
    expect(todayProgress([{ takenAt: ISO(17), total: 9 }], 10, NOW)).toEqual({
      answered: 0,
      goal: 10,
      done: false,
    });
    expect(todayProgress([{ takenAt: "junk", total: 9 }], 10, NOW).answered).toBe(0);
  });
});
