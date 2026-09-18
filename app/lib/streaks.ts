// Daily-loop math: streaks + today's goal progress. Pure functions over
// attempt timestamps — device-local calendar days, no server, no timezone
// library. Decided 2026-09-18: strict daily, any attempt counts, a "day" is
// the day the user experiences (device timezone), not a UTC slice.

export const DEFAULT_DAILY_GOAL = 10;
export const MIN_DAILY_GOAL = 1;
export const MAX_DAILY_GOAL = 200;

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

// Consecutive active days ending now. Alive when the last active day is
// today or yesterday (today still pending); anything older means broken —
// strict daily, no freezes. Future and unparseable stamps never count.
export function computeStreak(takenAts: string[], now: Date): Streak {
  const days = new Set<string>();
  for (const t of takenAts) {
    const ms = Date.parse(t);
    if (!Number.isNaN(ms)) days.add(dayKey(new Date(ms)));
  }
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
