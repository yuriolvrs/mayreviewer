import { describe, expect, it } from "vitest";
import {
  BADGE_FAMILIES,
  badgeStatus,
  bestStreak,
  claimBadgeLevel,
  computeStreak,
  dayKey,
  DEFAULT_STREAK_STATE,
  ensureMonthlyGrant,
  familyValue,
  monthKey,
  normalizeStreakState,
  restorableDay,
  shiftDay,
  spendRestore,
  todayProgress,
  type BadgeAttempt,
  type StreakDay,
} from "@/app/lib/streaks";

// Midday local times throughout: ISO round-trips stay on the same local day
// in any timezone, so these hold everywhere.
const NOON = (day: number) => new Date(2026, 8, day, 12, 0, 0);
const ISO = (day: number) => NOON(day).toISOString();
const NOW = NOON(18);

// A full streak day in one attempt; total is the knob the threshold tests turn.
const day = (d: number, total = 10): StreakDay => ({ takenAt: ISO(d), total });

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

  it("counts consecutive qualifying days ending today", () => {
    expect(computeStreak([day(18)], NOW)).toEqual({ count: 1, todayDone: true });
    expect(computeStreak([day(16), day(17), day(18)], NOW)).toEqual({ count: 3, todayDone: true });
  });

  it("stays alive on yesterday alone, with today pending", () => {
    expect(computeStreak([day(17)], NOW)).toEqual({ count: 1, todayDone: false });
  });

  it("breaks on a gap and counts only the current run", () => {
    expect(computeStreak([day(15), day(18)], NOW)).toEqual({ count: 1, todayDone: true });
    expect(computeStreak([day(10), day(11), day(17)], NOW)).toEqual({ count: 1, todayDone: false });
  });

  it("is zero when the last activity is older than yesterday", () => {
    expect(computeStreak([day(16)], NOW)).toEqual({ count: 0, todayDone: false });
  });

  it("ignores future and unparseable stamps", () => {
    expect(computeStreak([{ takenAt: ISO(25), total: 10 }, { takenAt: "not-a-date", total: 10 }, { takenAt: "", total: 10 }], NOW)).toEqual({
      count: 0,
      todayDone: false,
    });
    expect(
      computeStreak([day(17), { takenAt: ISO(25), total: 10 }, { takenAt: "junk", total: 10 }], NOW),
    ).toEqual({ count: 1, todayDone: false });
  });

  it("sums split attempts on one day", () => {
    expect(computeStreak([day(18, 6), day(18, 5), day(17)], NOW)).toEqual({
      count: 2,
      todayDone: true,
    });
  });

  it("needs five questions a day — a tap-in day does not count", () => {
    expect(computeStreak([day(18, 4)], NOW)).toEqual({ count: 0, todayDone: false });
    expect(computeStreak([day(18, 4), day(17)], NOW)).toEqual({ count: 1, todayDone: false });
    expect(computeStreak([day(18, 2), day(18, 3)], NOW)).toEqual({ count: 1, todayDone: true });
  });

  it("counts restored days as active", () => {
    expect(computeStreak([day(16), day(18)], NOW, ["2026-09-17"])).toEqual({
      count: 3,
      todayDone: true,
    });
  });
});

describe("bestStreak", () => {
  it("is zero with no qualifying days", () => {
    expect(bestStreak([])).toBe(0);
    expect(bestStreak([day(18, 2)])).toBe(0);
  });

  it("measures the longest run, not the trailing one", () => {
    expect(bestStreak([day(10), day(11), day(12), day(13), day(17)])).toBe(4);
    expect(bestStreak([day(16), day(17), day(18)])).toBe(3);
  });

  it("bridges restored days", () => {
    expect(bestStreak([day(10), day(12)], ["2026-09-11"])).toBe(3);
  });
});

describe("restorableDay", () => {
  it("names yesterday when the streak is alive-but-pending on it", () => {
    expect(restorableDay([day(16), day(18)], NOW)).toBe("2026-09-17");
    expect(restorableDay([day(15)], NOON(17))).toBe("2026-09-16");
  });

  it("is null when there is nothing to save", () => {
    // Yesterday already counts.
    expect(restorableDay([day(17), day(18)], NOW)).toBeNull();
    // Broken: the gap is wider than one day.
    expect(restorableDay([day(15), day(18)], NOW)).toBeNull();
    expect(restorableDay([day(15)], NOW)).toBeNull();
    // Never started.
    expect(restorableDay([], NOW)).toBeNull();
    // Already restored.
    expect(restorableDay([day(16), day(18)], NOW, ["2026-09-17"])).toBeNull();
  });
});

describe("ensureMonthlyGrant", () => {
  it("tops the bank up to three in a new month", () => {
    expect(ensureMonthlyGrant(DEFAULT_STREAK_STATE, NOW)).toEqual({
      ...DEFAULT_STREAK_STATE,
      banked: 3,
      grantedMonth: "2026-09",
    });
    // One banked means two free.
    const one = { ...DEFAULT_STREAK_STATE, banked: 1, grantedMonth: "2026-08" };
    expect(ensureMonthlyGrant(one, NOW).banked).toBe(3);
  });

  it("leaves a fuller bank alone and is a no-op within the month", () => {
    // Five banked (all milestone-earned) means no free ones.
    const full = { ...DEFAULT_STREAK_STATE, banked: 5, grantedMonth: "2026-08" };
    expect(ensureMonthlyGrant(full, NOW)).toEqual({ ...full, grantedMonth: "2026-09" });
    const granted = { ...DEFAULT_STREAK_STATE, banked: 3, grantedMonth: "2026-09" };
    expect(ensureMonthlyGrant(granted, NOW)).toBe(granted);
  });

  it("keys months on the device calendar", () => {
    expect(monthKey(new Date(2026, 0, 5))).toBe("2026-01");
    expect(monthKey(NOON(18))).toBe("2026-09");
  });
});

describe("spendRestore", () => {
  const stocked = { ...DEFAULT_STREAK_STATE, banked: 3, grantedMonth: "2026-09" };

  it("banks down and records the repaired day", () => {
    expect(spendRestore(stocked, "2026-09-17")).toEqual({
      ...stocked,
      banked: 2,
      restoredDays: ["2026-09-17"],
    });
  });

  it("refuses an empty bank and a double repair", () => {
    expect(spendRestore(DEFAULT_STREAK_STATE, "2026-09-17")).toBeNull();
    const spent = { ...stocked, banked: 2, restoredDays: ["2026-09-17"] };
    expect(spendRestore(spent, "2026-09-17")).toBeNull();
  });
});

describe("badge families", () => {
  // One kitchen-sink attempt per signal. Hours are device-local noon unless
  // noted, so owl/bird assertions hold in any timezone.
  const noon = (d: number): BadgeAttempt => ({
    takenAt: ISO(d),
    total: 10,
    score: 8,
    reviewerId: "rv1",
  });
  const atHour = (d: number, hour: number): BadgeAttempt => {
    const dt = new Date(2026, 8, d, hour, 0, 0);
    return { takenAt: dt.toISOString(), total: 10, score: 8, reviewerId: "rv1" };
  };

  it("counts levels per family from the same attempts", () => {
    const attempts: BadgeAttempt[] = [
      { ...noon(16), total: 60, score: 60, timeLimitSec: 600, durationSec: 200, parSec: 600 },
      { ...noon(17), reviewerId: "rv2" },
      { ...atHour(18, 23) },
      { ...atHour(18, 7) },
    ];
    const opts = { goal: 10, restoredDays: [] as string[] };
    // best streak 3 (16,17,18 at 10+ each) — medal assertions below use it.
    expect(familyValue("streak", attempts, opts)).toBe(3);
    expect(familyValue("questions", attempts, opts)).toBe(90);
    expect(familyValue("perfects", attempts, opts)).toBe(1);
    expect(familyValue("goals", attempts, opts)).toBe(3);
    // 200s against a 600s par: half or better, counts.
    expect(familyValue("speed", attempts, opts)).toBe(1);
    expect(familyValue("marathon", attempts, opts)).toBe(1);
    expect(familyValue("explorer", attempts, opts)).toBe(2);
    expect(familyValue("owl", attempts, opts)).toBe(1);
    expect(familyValue("bird", attempts, opts)).toBe(1);
  });

  it("resolves levels and the next threshold", () => {
    const streak = BADGE_FAMILIES.find((f) => f.id === "streak")!;
    expect(badgeStatus(streak, 0)).toMatchObject({ level: 0, nextAt: 7 });
    expect(badgeStatus(streak, 9)).toMatchObject({ level: 1, nextAt: 14 });
    expect(badgeStatus(streak, 500)).toMatchObject({ level: 8, nextAt: null });
  });

  it("a too-slow finish is not speedy, and goal days use the goal", () => {
    const slow: BadgeAttempt[] = [
      { ...noon(18), timeLimitSec: 600, durationSec: 500, parSec: 600 },
    ];
    expect(familyValue("speed", slow, { goal: 10, restoredDays: [] })).toBe(0);
    expect(familyValue("goals", [noon(18)], { goal: 10, restoredDays: [] })).toBe(1);
    expect(familyValue("goals", [noon(18)], { goal: 11, restoredDays: [] })).toBe(0);
    expect(familyValue("goals", [noon(18)], { goal: 0, restoredDays: [] })).toBe(0);
  });

  it("claims one level per tap, then refuses until the next level", () => {
    const questions = BADGE_FAMILIES.find((f) => f.id === "questions")!;
    const state = { ...DEFAULT_STREAK_STATE, banked: 1 };
    // 250 lifetime: levels 1 and 2 reached, nothing claimed.
    const once = claimBadgeLevel(state, questions, 250);
    expect(once).toEqual({ ...state, banked: 2, claimedLevels: { questions: 1 } });
    const twice = claimBadgeLevel(once!, questions, 250);
    expect(twice).toEqual({ ...once, banked: 3, claimedLevels: { questions: 2 } });
    expect(claimBadgeLevel(twice!, questions, 250)).toBeNull();
    // Unknown family and unearned levels refuse too.
    expect(claimBadgeLevel(state, { ...questions, id: "nope" } as never, 250)).toBeNull();
    expect(claimBadgeLevel(state, questions, 0)).toBeNull();
  });

  it("caps awards at the bank cap", () => {
    const questions = BADGE_FAMILIES.find((f) => f.id === "questions")!;
    const state = { ...DEFAULT_STREAK_STATE, banked: 6 };
    expect(claimBadgeLevel(state, questions, 250)!.banked).toBe(6);
    expect(claimBadgeLevel(state, questions, 250)!.claimedLevels).toEqual({ questions: 1 });
  });
});

describe("normalizeStreakState", () => {
  it("round-trips the default and clamps garbage", () => {
    expect(normalizeStreakState(DEFAULT_STREAK_STATE)).toEqual(DEFAULT_STREAK_STATE);
    expect(normalizeStreakState(null)).toEqual(DEFAULT_STREAK_STATE);
    expect(
      normalizeStreakState({
        banked: 99,
        grantedMonth: "soon",
        restoredDays: ["2026-09-17", "junk", "2026-09-17"],
        claimedLevels: { streak: 2, nope: 1, timed: -3 },
        claimedMilestones: ["questions-100", "nope"],
      }),
    ).toEqual({
      banked: 6,
      grantedMonth: "",
      restoredDays: ["2026-09-17"],
      claimedLevels: { streak: 2, questions: 1 },
    });
  });

  it("migrates flat-era milestone ids to family levels, keeping the max", () => {
    expect(
      normalizeStreakState({ claimedMilestones: ["streak-7", "streak-30", "first-timed"] }),
    ).toMatchObject({ claimedLevels: { streak: 2 } });
    expect(
      normalizeStreakState({
        claimedLevels: { streak: 5 },
        claimedMilestones: ["streak-7"],
      }),
    ).toMatchObject({ claimedLevels: { streak: 5 } });
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
