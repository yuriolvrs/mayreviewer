import { describe, expect, it } from "vitest";
import { normalizeSettings } from "@/app/lib/settings";
import {
  answeredCount,
  awardReachedLevels,
  BADGE_FAMILIES,
  badgeStatus,
  bestStreak,
  computeStreak,
  dayKey,
  DEFAULT_STREAK_STATE,
  ensureMonthlyGrant,
  familyValue,
  loopDelta,
  mergeStreakState,
  monthKey,
  normalizeStreakState,
  restorableDay,
  shiftDay,
  spendRestore,
  streakStatus,
  todayProgress,
  type BadgeAttempt,
  type LoopSnapshot,
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

  it("settles one pending award into the freed slot", () => {
    const full = { ...stocked, banked: 6, pending: 2 };
    expect(spendRestore(full, "2026-09-17")).toMatchObject({ banked: 6, pending: 1 });
    expect(spendRestore({ ...full, pending: 0 }, "2026-09-17")).toMatchObject({ banked: 5, pending: 0 });
  });

  it("refuses an empty bank and a double repair", () => {
    expect(spendRestore(DEFAULT_STREAK_STATE, "2026-09-17")).toBeNull();
    const spent = { ...stocked, banked: 2, restoredDays: ["2026-09-17"] };
    expect(spendRestore(spent, "2026-09-17")).toBeNull();
  });
});

describe("mergeStreakState", () => {
  const base = { ...DEFAULT_STREAK_STATE, banked: 3, grantedMonth: "2026-09" };

  it("keeps a claim only the loser made, and banks it", () => {
    const loser = { ...base, claimedLevels: { questions: 2 } };
    expect(mergeStreakState({ ...base, claimedLevels: { questions: 1 } }, loser)).toEqual({
      ...base,
      banked: 4,
      claimedLevels: { questions: 2 },
    });
  });

  it("keeps a spend only the loser made", () => {
    const loser = { ...base, banked: 2, restoredDays: ["2026-09-10"] };
    expect(mergeStreakState(base, loser)).toEqual({
      ...base,
      banked: 2,
      restoredDays: ["2026-09-10"],
    });
  });

  it("does not double-count a level claimed or a day restored on both sides", () => {
    const both = { ...base, claimedLevels: { streak: 1 }, restoredDays: ["2026-09-10"] };
    expect(mergeStreakState(both, both)).toEqual(both);
  });

  it("takes the winner's grant month and the per-family max", () => {
    const winner = { ...base, grantedMonth: "2026-09", claimedLevels: { streak: 3, owl: 1 } };
    const loser = { ...base, grantedMonth: "2026-08", claimedLevels: { streak: 1, bird: 2 } };
    const merged = mergeStreakState(winner, loser);
    expect(merged.grantedMonth).toBe("2026-09");
    expect(merged.claimedLevels).toEqual({ streak: 3, owl: 1, bird: 2 });
  });

  it("clamps the bank at 0 and at the cap", () => {
    const spent = { ...base, banked: 0 };
    const loserSpent = { ...base, banked: 1, restoredDays: ["2026-09-01", "2026-09-02"] };
    expect(mergeStreakState(spent, loserSpent).banked).toBe(0);
  });

  it("sends loser-only awards past the cap to pending, and keeps pending whole", () => {
    const full = { ...base, banked: 6 };
    const merged = mergeStreakState(full, { ...base, claimedLevels: { questions: 3 } });
    expect(merged).toMatchObject({ banked: 6, pending: 3 });
    // Winner pending carries over; a loser-only spend takes from the pool.
    const winner = { ...base, banked: 6, pending: 2, claimedLevels: { questions: 2 } };
    const loser = { ...base, banked: 5, restoredDays: ["2026-09-10"], claimedLevels: { questions: 2 } };
    expect(mergeStreakState(winner, loser)).toMatchObject({ banked: 6, pending: 1 });
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
      { ...noon(16), total: 60, score: 60 },
      { ...noon(17), reviewerId: "rv2" },
      { ...atHour(18, 23) },
      { ...atHour(18, 7) },
    ];
    const opts = { goal: 10, restoredDays: [] as string[] };
    expect(familyValue("streak", attempts, opts)).toBe(3);
    expect(familyValue("questions", attempts, opts)).toBe(90);
    expect(familyValue("perfects", attempts, opts)).toBe(1);
    expect(familyValue("goals", attempts, opts)).toBe(3);
    expect(familyValue("explorer", attempts, opts)).toBe(2);
  });

  it("Flawless needs five or more questions", () => {
    const tiny: BadgeAttempt = { ...noon(18), total: 4, score: 4 };
    const ok: BadgeAttempt = { ...noon(18), total: 5, score: 5 };
    expect(familyValue("perfects", [tiny], { goal: 10 })).toBe(0);
    expect(familyValue("perfects", [ok], { goal: 10 })).toBe(1);
  });

  it("resolves levels and the next threshold", () => {
    const streak = BADGE_FAMILIES.find((f) => f.id === "streak")!;
    expect(badgeStatus(streak, 0)).toMatchObject({ level: 0, nextAt: 7 });
    expect(badgeStatus(streak, 9)).toMatchObject({ level: 1, nextAt: 14 });
    expect(badgeStatus(streak, 500)).toMatchObject({ level: 8, nextAt: null });
  });

  it("goal days use the goal", () => {
    expect(familyValue("goals", [noon(18)], { goal: 10, restoredDays: [] })).toBe(1);
    expect(familyValue("goals", [noon(18)], { goal: 11, restoredDays: [] })).toBe(0);
    expect(familyValue("goals", [noon(18)], { goal: 0, restoredDays: [] })).toBe(0);
  });

  const manyAnswers = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`q${i}`, 0]));
  // 250 lifetime questions: Riddler levels 1 and 2 reached.
  const lifetime250: BadgeAttempt[] = [
    { ...noon(10), total: 125, score: 0, answers: manyAnswers(125) },
    { ...noon(11), total: 125, score: 0, answers: manyAnswers(125) },
  ];

  it("awards every reached level once, and is idempotent", () => {
    const state = { ...DEFAULT_STREAK_STATE, banked: 1 };
    const once = awardReachedLevels(state, lifetime250, 200);
    expect(once).toMatchObject({ banked: 3, pending: 0, claimedLevels: { questions: 2 } });
    expect(awardReachedLevels(once, lifetime250, 200)).toBe(once);
    expect(awardReachedLevels(state, [], 200)).toBe(state);
  });

  it("sends awards past the cap to pending without re-awarding", () => {
    const full = { ...DEFAULT_STREAK_STATE, banked: 6 };
    const awarded = awardReachedLevels(full, lifetime250, 200);
    expect(awarded).toMatchObject({ banked: 6, pending: 2, claimedLevels: { questions: 2 } });
    expect(awardReachedLevels(awarded, lifetime250, 200)).toBe(awarded);
    // Spending then settles one pending into the bank.
    expect(spendRestore(awarded, "2026-09-17")).toMatchObject({ banked: 6, pending: 1 });
  });

  it("measures each day against its own goal, not the current one", () => {
    const stamped = (d: number, total: number, dailyGoal?: number): BadgeAttempt => ({
      takenAt: ISO(d),
      total,
      score: 0,
      reviewerId: "rv1",
      dailyGoal,
    });
    // Stamped days: lowering the current goal to 1 changes nothing.
    const days = [stamped(16, 12, 20), stamped(17, 12, 10)];
    expect(familyValue("goals", days, { goal: 1 })).toBe(1);
    expect(familyValue("goals", days, { goal: 50 })).toBe(1);
    // Legacy day (no stamp): floor is the default goal, even if goal is lowered.
    expect(familyValue("goals", [stamped(16, 5)], { goal: 1 })).toBe(0);
    expect(familyValue("goals", [stamped(16, 10)], { goal: 1 })).toBe(1);
    // A raised current goal still applies to legacy days.
    expect(familyValue("goals", [stamped(16, 10)], { goal: 15 })).toBe(0);
    // Mixed day: the max goal among its attempts wins.
    const mixed = [stamped(16, 6, 5), stamped(16, 6, 20)];
    expect(familyValue("goals", mixed, { goal: 1 })).toBe(0);
    expect(familyValue("goals", [stamped(16, 6, 5), stamped(16, 6)], { goal: 1 })).toBe(1);
    // A stamp below the minimum goal still needs the minimum.
    expect(familyValue("goals", [stamped(16, 4, 2)], { goal: 1 })).toBe(0);
    expect(familyValue("goals", [stamped(16, 5, 2)], { goal: 1 })).toBe(1);
  });
});

describe("normalizeStreakState", () => {
  it("round-trips the default and clamps garbage", () => {
    expect(normalizeStreakState(DEFAULT_STREAK_STATE)).toEqual(DEFAULT_STREAK_STATE);
    expect(normalizeStreakState(null)).toEqual(DEFAULT_STREAK_STATE);
    expect(
      normalizeStreakState({
        banked: 99,
        pending: 2.7,
        grantedMonth: "soon",
        restoredDays: ["2026-09-17", "junk", "2026-09-17"],
        claimedLevels: { streak: 2, nope: 1, timed: -3, owl: 4, speed: 1 },
        claimedMilestones: ["questions-100", "nope"],
      }),
    ).toEqual({
      banked: 6,
      pending: 2,
      grantedMonth: "",
      restoredDays: ["2026-09-17"],
      claimedLevels: { streak: 2, questions: 1 },
    });
  });

  it("normalizes pending to a non-negative integer", () => {
    expect(normalizeStreakState({ pending: -4 }).pending).toBe(0);
    expect(normalizeStreakState({ pending: "x" }).pending).toBe(0);
    expect(normalizeStreakState({}).pending).toBe(0);
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

describe("answeredCount", () => {
  it("counts picked options and non-empty typed text once", () => {
    expect(answeredCount({ total: 50, answers: {} })).toBe(0);
    expect(answeredCount({ total: 50, answers: { a: 1, b: 0 } })).toBe(2);
    expect(
      answeredCount({ total: 50, answers: { a: 1 }, textAnswers: { a: "dup", b: " hi ", c: "   ", d: "" } }),
    ).toBe(2);
  });

  it("falls back to a finite total without an answers field", () => {
    expect(answeredCount({ total: 7 })).toBe(7);
    expect(answeredCount({ total: Number.NaN })).toBe(0);
  });
});

describe("honest rewards", () => {
  const blank = (d: number): StreakDay => ({ takenAt: ISO(d), total: 50, answers: {} });
  const answered = (d: number, n: number): StreakDay => ({
    takenAt: ISO(d),
    total: 50,
    answers: Object.fromEntries(Array.from({ length: n }, (_, i) => [`q${i}`, 0])),
  });

  it("a blanks-only attempt makes no streak day and no goal progress", () => {
    expect(computeStreak([blank(18)], NOW)).toEqual({ count: 0, todayDone: false });
    expect(todayProgress([blank(18)], 10, NOW)).toEqual({ answered: 0, goal: 10, done: false });
    expect(familyValue("questions", [{ ...blank(18), score: 0, reviewerId: "r" }], { goal: 10 })).toBe(0);
  });

  it("answered questions make the day, typed text counts, legacy falls back to total", () => {
    expect(computeStreak([answered(18, 5)], NOW)).toEqual({ count: 1, todayDone: true });
    const typed: StreakDay = {
      takenAt: ISO(18),
      total: 5,
      answers: {},
      textAnswers: { a: "x", b: "y", c: "z", d: "w", e: "v" },
    };
    expect(computeStreak([typed], NOW).todayDone).toBe(true);
    expect(computeStreak([{ takenAt: ISO(18), total: 5 }], NOW).todayDone).toBe(true);
  });
});

describe("daily goal minimum", () => {
  it("clamps stored goals of 1-4 up to 5", () => {
    expect(normalizeSettings({ dailyGoal: 1 }).dailyGoal).toBe(5);
    expect(normalizeSettings({ dailyGoal: 4 }).dailyGoal).toBe(5);
    expect(normalizeSettings({ dailyGoal: 5 }).dailyGoal).toBe(5);
    expect(normalizeSettings({ dailyGoal: 12 }).dailyGoal).toBe(12);
  });
});

describe("loopDelta", () => {
  const answers = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`q${i}`, 0]));
  const att = (d: number, n: number): BadgeAttempt => ({
    takenAt: ISO(d),
    total: n,
    score: 0,
    reviewerId: "rv1",
    answers: answers(n),
  });
  const snap = (attempts: BadgeAttempt[], goal = 10): LoopSnapshot => ({
    attempts,
    state: DEFAULT_STREAK_STATE,
    goal,
    now: NOW,
  });

  it("reports goal met, streak day earned and levels reached by one attempt", () => {
    const delta = loopDelta(snap([att(18, 4)]), snap([att(18, 4), att(18, 96)]));
    expect(delta).toMatchObject({ goalMet: true, goalDone: true, streakCount: 1, streakDayJustEarned: true });
    expect(delta.levelsReached).toEqual([
      { family: "questions", label: "Riddler", level: 1 },
      { family: "goals", label: "Goal Getter", level: 1 },
    ]);
  });

  it("reports goal progress when the goal is not met", () => {
    const delta = loopDelta(snap([]), snap([att(18, 4)]));
    expect(delta).toMatchObject({ goalMet: false, goalDone: false, goalAnswered: 4, goalTarget: 10 });
  });

  it("is quiet when nothing new happened", () => {
    const state = snap([att(18, 12)]);
    expect(loopDelta(state, state)).toEqual({
      goalMet: false,
      goalDone: true,
      goalAnswered: 12,
      goalTarget: 10,
      streakCount: 1,
      streakDayJustEarned: false,
      levelsReached: [],
    });
  });
});

describe("streakStatus", () => {
  const act = (d: number, n = 10): StreakDay => ({ takenAt: ISO(d), total: n });
  const state = DEFAULT_STREAK_STATE;

  it("none: no streak and nothing to restore", () => {
    expect(streakStatus([], state, NOW)).toEqual({ kind: "none", count: 0, restoredCount: 0, remaining: 5 });
    expect(streakStatus([act(15)], state, NOW).kind).toBe("none");
  });

  it("safe: today is done", () => {
    expect(streakStatus([act(17), act(18)], state, NOW)).toEqual({
      kind: "safe",
      count: 2,
      restoredCount: 0,
      remaining: 0,
    });
  });

  it("pending: alive, today not done, with questions remaining", () => {
    expect(streakStatus([act(17), act(18, 2)], state, NOW)).toEqual({
      kind: "pending",
      count: 1,
      restoredCount: 0,
      remaining: 3,
    });
  });

  it("restorable: yesterday missed, day before active", () => {
    expect(streakStatus([act(15), act(16)], state, NOW)).toEqual({
      kind: "restorable",
      count: 2,
      restoredCount: 3,
      remaining: 5,
    });
    expect(streakStatus([act(15), act(16), act(18)], state, NOW)).toMatchObject({
      kind: "restorable",
      count: 2,
      restoredCount: 4,
      remaining: 0,
    });
  });
});
