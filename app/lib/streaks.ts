// Daily-loop math: streaks + today's goal progress. Pure functions over
// attempt data — device-local calendar days, no server, no timezone library.
// Decided 2026-09-18, revised 2026-09-20: a streak day needs real work (five
// answered questions, any reviewer, any type), not a tap-in. A "day" is the
// day the user experiences (device timezone), not a UTC slice.

export const DEFAULT_DAILY_GOAL = 10;
export const MIN_DAILY_GOAL = 1;
export const MAX_DAILY_GOAL = 200;

// Questions answered on one calendar day before it counts toward the streak.
export const STREAK_DAY_MIN_QUESTIONS = 5;

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
export type StreakDay = { takenAt: string; total: number };

// Days that count: per-day answered totals at or above the bar, plus repaired
// (restored) days, which read as active for every computation below. Exported
// for the week dots, which need the set itself rather than a derived number.
export function activeDays(attempts: StreakDay[], restoredDays: string[]): Set<string> {
  const totals = new Map<string, number>();
  for (const attempt of attempts) {
    const ms = Date.parse(attempt.takenAt);
    if (Number.isNaN(ms)) continue;
    const key = dayKey(new Date(ms));
    const total = Number.isFinite(attempt.total) ? Math.max(0, attempt.total) : 0;
    totals.set(key, (totals.get(key) ?? 0) + total);
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
};

export const DEFAULT_STREAK_STATE: StreakState = {
  banked: 0,
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
// restore is meaningful — this only guards the accounting.
export function spendRestore(state: StreakState, day: string): StreakState | null {
  if (state.banked < 1 || state.restoredDays.includes(day)) return null;
  return { ...state, banked: state.banked - 1, restoredDays: [...state.restoredDays, day] };
}

// Badge families: every achievement is one tile with levels inside. Each
// level-up banks one restore. Progress extractors read attempts the app
// already stores — hours are device-local, like every other day boundary
// here; goal days measure against the current goal setting.
export type BadgeFamilyId =
  | "streak"
  | "questions"
  | "perfects"
  | "goals"
  | "speed"
  | "marathon"
  | "explorer"
  | "owl"
  | "bird";

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
  { id: "speed", label: "Speedster", description: "Quizzes finished in half the estimate", levels: [1, 5, 15] },
  { id: "marathon", label: "Enduring", description: "Quizzes with 50+ questions taken", levels: [1, 3, 5] },
  { id: "explorer", label: "Explorer", description: "Different reviewers quizzed", levels: [3, 5, 10] },
  { id: "owl", label: "Night Owl", description: "Quizzes after 10pm", levels: [1, 5, 15] },
  { id: "bird", label: "Early Bird", description: "Quizzes before 9am", levels: [1, 5, 15] },
];

export type BadgeAttempt = {
  takenAt: string;
  total: number;
  score: number;
  reviewerId: string;
  timeLimitSec?: number | null;
  durationSec?: number;
  parSec?: number | null;
};

function finiteTotal(total: unknown): number {
  return typeof total === "number" && Number.isFinite(total) ? Math.max(0, total) : 0;
}

function attemptHour(takenAt: string): number | null {
  const ms = Date.parse(takenAt);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).getHours();
}

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
      return attempts.reduce((sum, a) => sum + finiteTotal(a.total), 0);
    case "perfects":
      return attempts.filter((a) => a.total > 0 && a.score === a.total).length;
    case "goals": {
      if (!(opts.goal > 0)) return 0;
      const perDay = new Map<string, number>();
      for (const a of attempts) {
        const ms = Date.parse(a.takenAt);
        if (Number.isNaN(ms)) continue;
        const key = dayKey(new Date(ms));
        perDay.set(key, (perDay.get(key) ?? 0) + finiteTotal(a.total));
      }
      let days = 0;
      for (const total of perDay.values()) if (total >= opts.goal) days++;
      return days;
    }
    case "speed":
      return attempts.filter(
        (a) =>
          a.timeLimitSec != null &&
          a.parSec != null &&
          a.parSec > 0 &&
          (a.durationSec ?? Number.POSITIVE_INFINITY) * 2 <= a.parSec,
      ).length;
    case "marathon":
      return attempts.filter((a) => a.total >= 50).length;
    case "explorer":
      return new Set(attempts.map((a) => a.reviewerId)).size;
    case "owl":
      return attempts.filter((a) => {
        const h = attemptHour(a.takenAt);
        return h !== null && h >= 22;
      }).length;
    case "bird":
      return attempts.filter((a) => {
        const h = attemptHour(a.takenAt);
        return h !== null && h < 9;
      }).length;
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

// Claims the next unclaimed reached level (+1 restore). Null when nothing new
// is reached, the id is unknown, or the bank interaction is illegal — callers
// check badgeStatus first for whether a claim is meaningful.
export function claimBadgeLevel(
  state: StreakState,
  family: BadgeFamily,
  value: number,
): StreakState | null {
  if (!BADGE_FAMILIES.some((f) => f.id === family.id)) return null;
  const claimed = state.claimedLevels[family.id] ?? 0;
  const { level } = badgeStatus(family, value);
  if (level <= claimed) return null;
  return {
    ...state,
    banked: Math.min(RESTORES_CAP, state.banked + 1),
    claimedLevels: { ...state.claimedLevels, [family.id]: claimed + 1 },
  };
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
  return {
    banked: Math.min(Math.max(banked, 0), RESTORES_CAP),
    grantedMonth:
      typeof v.grantedMonth === "string" && /^\d{4}-\d{2}$/.test(v.grantedMonth) ? v.grantedMonth : "",
    restoredDays: [
      ...new Set((Array.isArray(v.restoredDays) ? v.restoredDays : []).filter(validDay)),
    ].slice(0, 366),
    claimedLevels,
  };
}

export type GoalProgress = { answered: number; goal: number; done: boolean };

// Questions answered today = each attempt's total (the questions it asked),
// summed over today's attempts. Done implies todayDone on the streak.
export function todayProgress(
  attempts: { takenAt: string; total: number }[],
  goal: number,
  now: Date,
): GoalProgress {
  const today = dayKey(now);
  let answered = 0;
  for (const a of attempts) {
    const ms = Date.parse(a.takenAt);
    if (!Number.isNaN(ms) && dayKey(new Date(ms)) === today) answered += a.total;
  }
  return { answered, goal, done: answered >= goal };
}
