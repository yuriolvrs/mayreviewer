// Daily-loop math: streaks + today's goal progress. Pure functions over
// attempt data — device-local calendar days, no server, no timezone library.
// Decided 2026-09-18, revised 2026-09-20: a streak day needs real work (five
// answered questions, any reviewer, any type), not a tap-in. A "day" is the
// day the user experiences (device timezone), not a UTC slice.

export const DEFAULT_DAILY_GOAL = 10;
export const MAX_DAILY_GOAL = 200;

// Questions answered on one calendar day before it counts toward the streak.
export const STREAK_DAY_MIN_QUESTIONS = 5;
// A goal below the streak-day bar would be easier than a streak day.
export const MIN_DAILY_GOAL = STREAK_DAY_MIN_QUESTIONS;

// Restores: each repairs one missed day, spendable only the day after the
// miss. The free grant tops the bank up to three every calendar month — one
// banked means two free, five banked (all milestone-earned) means none.
// Milestone awards can bank above the free line, up to the cap.
export const RESTORES_PER_MONTH = 3;
export const RESTORES_CAP = 6;

// Local calendar day key. Constructed from parts (never toISOString, which
// is UTC) so the day boundary matches the device clock.
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function shiftDay(key: string, deltaDays: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return dayKey(dt);
}

export type Streak = { count: number; todayDone: boolean };

// The per-day totals the streak counts. Split attempts on one day sum — two
// 3-question quizzes still make the day.
export type StreakDay = {
  takenAt: string;
  total: number;
  answers?: Record<string, number>;
  textAnswers?: Record<string, string>;
};

function finiteTotal(total: unknown): number {
  return typeof total === "number" && Number.isFinite(total) ? Math.max(0, total) : 0;
}

// Questions the user really answered in one attempt: picked options plus
// typed text (not already picked). Blank submits count zero. An attempt with
// no `answers` field is legacy: fall back to its total.
export function answeredCount(attempt: Pick<StreakDay, "total" | "answers" | "textAnswers">): number {
  const { answers, textAnswers } = attempt;
  if (!answers) return finiteTotal(attempt.total);
  let count = Object.keys(answers).length;
  for (const [id, text] of Object.entries(textAnswers ?? {})) {
    if (typeof text === "string" && text.trim() !== "" && !(id in answers)) count++;
  }
  return count;
}

export function isCountedAttempt(attempt: Pick<StreakDay, "total" | "answers" | "textAnswers">): boolean {
  return answeredCount(attempt) > 0;
}

// Days that count: per-day answered counts at or above the bar, plus repaired
// (restored) days, which read as active for every computation below. Exported
// for the week dots, which need the set itself rather than a derived number.
export function activeDays(attempts: StreakDay[], restoredDays: string[]): Set<string> {
  const totals = new Map<string, number>();
  for (const attempt of attempts) {
    const ms = Date.parse(attempt.takenAt);
    if (Number.isNaN(ms)) continue;
    const key = dayKey(new Date(ms));
    totals.set(key, (totals.get(key) ?? 0) + answeredCount(attempt));
  }
  const days = new Set<string>();
  for (const [key, total] of totals) {
    if (total >= STREAK_DAY_MIN_QUESTIONS) days.add(key);
  }
  for (const key of restoredDays) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) days.add(key);
  }
  return days;
}

// Consecutive active days ending now. Alive when the last active day is
// today or yesterday (today still pending); anything older means broken —
// strict daily, no freezes. Future and unparseable stamps never count.
export function computeStreak(
  attempts: StreakDay[],
  now: Date,
  restoredDays: string[] = [],
): Streak {
  const days = activeDays(attempts, restoredDays);
  const today = dayKey(now);
  const cursor = days.has(today) ? today : days.has(shiftDay(today, -1)) ? shiftDay(today, -1) : null;
  if (!cursor) return { count: 0, todayDone: false };
  let count = 0;
  let back = cursor;
  while (days.has(back)) {
    count++;
    back = shiftDay(back, -1);
  }
  return { count, todayDone: days.has(today) };
}

// Longest run of consecutive active days ever — what the streak-length
// milestones measure against. Restored days bridge like any active day.
export function bestStreak(attempts: StreakDay[], restoredDays: string[] = []): number {
  const days = activeDays(attempts, restoredDays);
  let best = 0;
  for (const key of days) {
    if (days.has(shiftDay(key, -1))) continue; // mid-run, not a run start
    let run = 0;
    let forward = key;
    while (days.has(forward)) {
      run++;
      forward = shiftDay(forward, 1);
    }
    best = Math.max(best, run);
  }
  return best;
}

// The one day a restore can still save: yesterday, and only when the streak
// is alive-but-pending on it (the day before is active). Broken, already
// restored, or never-started all read as null — there is nothing to save.
export function restorableDay(
  attempts: StreakDay[],
  now: Date,
  restoredDays: string[] = [],
): string | null {
  const days = activeDays(attempts, restoredDays);
  const yesterday = shiftDay(dayKey(now), -1);
  if (days.has(yesterday)) return null;
  if (!days.has(shiftDay(yesterday, -1))) return null;
  return yesterday;
}

export type StreakState = {
  banked: number;
  grantedMonth: string;
  restoredDays: string[];
  // Highest claimed level per badge family (levels claim in order, one per
  // tap). Replaces the old one-claim-per-id milestone list — see the legacy
  // mapping in normalizeStreakState.
  claimedLevels: Partial<Record<BadgeFamilyId, number>>;
  // Awards earned while the bank was full. They move into the bank as
  // restores are spent, so no reached level is ever lost.
  pending: number;
};

export const DEFAULT_STREAK_STATE: StreakState = {
  banked: 0,
  pending: 0,
  grantedMonth: "",
  restoredDays: [],
  claimedLevels: {},
};

// Calendar month of the grant cycle, device-local like everything else here.
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// Idempotent top-up: the first read in a new month fills the bank back to
// three; a fuller bank (milestone earnings) is left alone. Every other call
// returns the state untouched.
export function ensureMonthlyGrant(state: StreakState, now: Date): StreakState {
  const month = monthKey(now);
  if (state.grantedMonth === month) return state;
  return {
    ...state,
    banked: Math.max(state.banked, RESTORES_PER_MONTH),
    grantedMonth: month,
  };
}

// Spends one banked restore on a day, or null when illegal: empty bank, or
// the day already repaired. Callers check restorableDay first for whether a
// restore is meaningful — this only guards the accounting. The freed slot is
// filled from pending awards.
export function spendRestore(state: StreakState, day: string): StreakState | null {
  if (state.banked < 1 || state.restoredDays.includes(day)) return null;
  const settle = state.pending > 0 ? 1 : 0;
  return {
    ...state,
    banked: state.banked - 1 + settle,
    pending: state.pending - settle,
    restoredDays: [...state.restoredDays, day],
  };
}

// Sync merge of two streak states (winner = the settings side that won
// last-write-wins). Nothing either side spent or claimed is lost: restored
// days union, claimed levels take the per-family max, and the bank follows the
// winner plus the awards (+1 each) and spends (-1 each) only the loser made.
// Bank and pending merge as one pool: anything past the cap stays pending.
export function mergeStreakState(winner: StreakState, loser: StreakState): StreakState {
  const restoredDays = [...new Set([...winner.restoredDays, ...loser.restoredDays])].slice(0, 366);
  const claimedLevels: Partial<Record<BadgeFamilyId, number>> = { ...winner.claimedLevels };
  let loserOnlyClaims = 0;
  for (const [key, n] of Object.entries(loser.claimedLevels)) {
    const family = key as BadgeFamilyId;
    const won = winner.claimedLevels[family] ?? 0;
    if (n > won) {
      claimedLevels[family] = n;
      loserOnlyClaims += n - won;
    }
  }
  const winnerDays = new Set(winner.restoredDays);
  const loserOnlySpends = new Set(loser.restoredDays.filter((d) => !winnerDays.has(d))).size;
  const pool = Math.max(0, winner.banked + winner.pending + loserOnlyClaims - loserOnlySpends);
  const banked = Math.min(RESTORES_CAP, pool);
  return {
    banked,
    pending: pool - banked,
    grantedMonth: winner.grantedMonth,
    restoredDays,
    claimedLevels,
  };
}

// Badge families: every achievement is one tile with levels inside. Each
// level-up banks one restore. Progress extractors read attempts the app
// already stores — hours are device-local, like every other day boundary
// here; goal days measure against the goal of that day.
export type BadgeFamilyId =
  | "streak"
  | "questions"
  | "perfects"
  | "goals"
  | "explorer";

export type BadgeFamily = {
  id: BadgeFamilyId;
  label: string;
  description: string;
  levels: number[];
};

export const BADGE_FAMILIES: BadgeFamily[] = [
  { id: "streak", label: "Relentless", description: "Unbroken streak days", levels: [7, 14, 30, 60, 100, 200, 365, 500] },
  { id: "questions", label: "Riddler", description: "Lifetime questions answered", levels: [100, 200, 300, 500, 750, 1000] },
  { id: "perfects", label: "Flawless", description: "Quizzes scored 100%", levels: [1, 3, 5, 10, 15, 25, 50, 75, 100] },
  { id: "goals", label: "Goal Getter", description: "Days you hit the daily goal", levels: [1, 10, 30, 60] },
  { id: "explorer", label: "Explorer", description: "Different reviewers quizzed", levels: [3, 5, 10] },
];

export type BadgeAttempt = {
  takenAt: string;
  total: number;
  score: number;
  reviewerId: string;
  answers?: Record<string, number>;
  textAnswers?: Record<string, string>;
  // Goal setting when the attempt was taken; absent on legacy attempts.
  dailyGoal?: number;
};

// The raw count a family levels on.
export function familyValue(
  id: BadgeFamilyId,
  attempts: BadgeAttempt[],
  opts: { goal: number; restoredDays?: string[] },
): number {
  switch (id) {
    case "streak":
      return bestStreak(attempts, opts.restoredDays ?? []);
    case "questions":
      return attempts.reduce((sum, a) => sum + answeredCount(a), 0);
    case "perfects":
      return attempts.filter((a) => a.total >= STREAK_DAY_MIN_QUESTIONS && a.score === a.total).length;
    case "goals": {
      if (!(opts.goal > 0)) return 0;
      // A day's goal is the highest one stamped on its attempts. An unstamped
      // (legacy) attempt counts as the higher of the current goal and the
      // default, so lowering the goal cannot reopen old days.
      const legacyGoal = Math.max(opts.goal, DEFAULT_DAILY_GOAL);
      const perDay = new Map<string, { total: number; goal: number }>();
      for (const a of attempts) {
        const ms = Date.parse(a.takenAt);
        if (Number.isNaN(ms)) continue;
        const key = dayKey(new Date(ms));
        const day = perDay.get(key) ?? { total: 0, goal: 0 };
        day.total += answeredCount(a);
        const stamped =
          typeof a.dailyGoal === "number" && Number.isFinite(a.dailyGoal) && a.dailyGoal > 0
            ? Math.max(a.dailyGoal, MIN_DAILY_GOAL)
            : legacyGoal;
        day.goal = Math.max(day.goal, stamped);
        perDay.set(key, day);
      }
      let days = 0;
      for (const day of perDay.values()) if (day.total >= day.goal) days++;
      return days;
    }
    case "explorer":
      return new Set(attempts.map((a) => a.reviewerId)).size;
  }
}

export type BadgeStatus = {
  family: BadgeFamily;
  value: number;
  // Levels reached (0 = locked). Thresholds claim in order.
  level: number;
  // Next threshold, or null when maxed.
  nextAt: number | null;
};

// Levels reached for a raw value: the count of thresholds at or below it.
export function badgeStatus(family: BadgeFamily, value: number): BadgeStatus {
  let level = 0;
  for (const threshold of family.levels) {
    if (value >= threshold) level++;
    else break;
  }
  return { family, value, level, nextAt: level < family.levels.length ? family.levels[level] : null };
}

// Awards every newly reached level (+1 restore each), automatically. A full
// bank sends the award to pending instead; the level still counts as claimed,
// so it is never awarded twice. Idempotent: a second call awards nothing.
export function awardReachedLevels(
  state: StreakState,
  attempts: BadgeAttempt[],
  goal: number,
): StreakState {
  let { banked, pending } = state;
  const claimedLevels = { ...state.claimedLevels };
  for (const family of BADGE_FAMILIES) {
    const { level } = badgeStatus(
      family,
      familyValue(family.id, attempts, { goal, restoredDays: state.restoredDays }),
    );
    for (let claimed = claimedLevels[family.id] ?? 0; claimed < level; claimed++) {
      if (banked < RESTORES_CAP) banked++;
      else pending++;
      claimedLevels[family.id] = claimed + 1;
    }
  }
  if (banked === state.banked && pending === state.pending) return state;
  return { ...state, banked, pending, claimedLevels };
}

// One-shot ids from the flat milestone era, mapped to family levels so
// nobody loses a claimed award in the upgrade.
const LEGACY_MILESTONES: Record<string, { family: BadgeFamilyId; level: number }> = {
  "streak-7": { family: "streak", level: 1 },
  "streak-30": { family: "streak", level: 2 },
  "questions-100": { family: "questions", level: 1 },
  "questions-500": { family: "questions", level: 4 },
  "first-perfect": { family: "perfects", level: 1 },
};

// Backfills defaults for streak state saved before a field existed, and
// clamps the bank — same normalize-on-read pattern as settings/storage.
export function normalizeStreakState(value: unknown): StreakState {
  const v = (typeof value === "object" && value !== null ? value : {}) as Partial<StreakState> & {
    claimedMilestones?: unknown;
  };
  const banked =
    typeof v.banked === "number" && Number.isFinite(v.banked) ? Math.floor(v.banked) : 0;
  const validDay = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const knownFamilies = new Set<string>(BADGE_FAMILIES.map((f) => f.id));
  const claimedLevels: Partial<Record<BadgeFamilyId, number>> = {};
  if (typeof v.claimedLevels === "object" && v.claimedLevels !== null) {
    for (const [key, n] of Object.entries(v.claimedLevels)) {
      if (!knownFamilies.has(key)) continue;
      const count = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : 0;
      if (count > 0) claimedLevels[key as BadgeFamilyId] = count;
    }
  }
  if (Array.isArray(v.claimedMilestones)) {
    for (const id of v.claimedMilestones) {
      if (typeof id !== "string") continue;
      const mapped = LEGACY_MILESTONES[id];
      if (!mapped) continue;
      claimedLevels[mapped.family] = Math.max(claimedLevels[mapped.family] ?? 0, mapped.level);
    }
  }
  const pending =
    typeof v.pending === "number" && Number.isFinite(v.pending) ? Math.max(0, Math.floor(v.pending)) : 0;
  return {
    banked: Math.min(Math.max(banked, 0), RESTORES_CAP),
    pending,
    grantedMonth:
      typeof v.grantedMonth === "string" && /^\d{4}-\d{2}$/.test(v.grantedMonth) ? v.grantedMonth : "",
    restoredDays: [
      ...new Set((Array.isArray(v.restoredDays) ? v.restoredDays : []).filter(validDay)),
    ].slice(0, 366),
    claimedLevels,
  };
}

export type GoalProgress = { answered: number; goal: number; done: boolean };

// Questions answered today = each attempt's answeredCount, summed over
// today's attempts. With the goal at or above the streak bar, done implies
// todayDone on the streak.
export function todayProgress(
  attempts: StreakDay[],
  goal: number,
  now: Date,
): GoalProgress {
  const today = dayKey(now);
  let answered = 0;
  for (const a of attempts) {
    const ms = Date.parse(a.takenAt);
    if (!Number.isNaN(ms) && dayKey(new Date(ms)) === today) answered += answeredCount(a);
  }
  return { answered, goal, done: answered >= goal };
}

export type LoopSnapshot = {
  attempts: BadgeAttempt[];
  state: StreakState;
  goal: number;
  now: Date;
};

export type LoopDelta = {
  goalMet: boolean;
  goalDone: boolean;
  // Today's questions answered and the goal, after the attempt.
  goalAnswered: number;
  goalTarget: number;
  streakCount: number;
  streakDayJustEarned: boolean;
  levelsReached: { family: BadgeFamilyId; label: string; level: number }[];
};

function snapshotLevel(family: BadgeFamily, snap: LoopSnapshot): number {
  const value = familyValue(family.id, snap.attempts, {
    goal: snap.goal,
    restoredDays: snap.state.restoredDays,
  });
  return badgeStatus(family, value).level;
}

// What one attempt changed: goal, streak day and badge levels. The result
// screen reads this to show the reward right away.
export function loopDelta(before: LoopSnapshot, after: LoopSnapshot): LoopDelta {
  const goalBefore = todayProgress(before.attempts, before.goal, before.now).done;
  const goalAfter = todayProgress(after.attempts, after.goal, after.now);
  const streakBefore = computeStreak(before.attempts, before.now, before.state.restoredDays);
  const streakAfter = computeStreak(after.attempts, after.now, after.state.restoredDays);
  const levelsReached: LoopDelta["levelsReached"] = [];
  for (const family of BADGE_FAMILIES) {
    const level = snapshotLevel(family, after);
    if (level > snapshotLevel(family, before)) {
      levelsReached.push({ family: family.id, label: family.label, level });
    }
  }
  return {
    goalMet: !goalBefore && goalAfter.done,
    goalDone: goalAfter.done,
    goalAnswered: goalAfter.answered,
    goalTarget: goalAfter.goal,
    streakCount: streakAfter.count,
    streakDayJustEarned: !streakBefore.todayDone && streakAfter.todayDone,
    levelsReached,
  };
}

export type StreakStatus = {
  kind: "none" | "safe" | "pending" | "restorable";
  // Current streak, or the run length before the missed day when restorable.
  count: number;
  // Streak length after a restore (restorable only, else 0).
  restoredCount: number;
  // Questions still needed today to make the streak day.
  remaining: number;
};

export function streakStatus(attempts: StreakDay[], state: StreakState, now: Date): StreakStatus {
  const answered = todayProgress(attempts, STREAK_DAY_MIN_QUESTIONS, now).answered;
  const remaining = Math.max(0, STREAK_DAY_MIN_QUESTIONS - answered);
  const missed = restorableDay(attempts, now, state.restoredDays);
  if (missed !== null) {
    const days = activeDays(attempts, state.restoredDays);
    let count = 0;
    for (let back = shiftDay(missed, -1); days.has(back); back = shiftDay(back, -1)) count++;
    const restoredCount = computeStreak(attempts, now, [...state.restoredDays, missed]).count;
    return { kind: "restorable", count, restoredCount, remaining };
  }
  const current = computeStreak(attempts, now, state.restoredDays);
  if (current.count === 0) return { kind: "none", count: 0, restoredCount: 0, remaining };
  return { kind: current.todayDone ? "safe" : "pending", count: current.count, restoredCount: 0, remaining };
}
