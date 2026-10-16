"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PageSkeleton from "@/app/components/PageSkeleton";
import { getAllQuizHistory, getReviewers } from "@/app/lib/storage";
import { getSettings, getStreakState, updateSettings, SETTINGS_CHANGED_EVENT } from "@/app/lib/settings";
import {
  activeDays,
  restorableDay,
  RESTORES_CAP,
  RESTORES_PER_MONTH,
  STREAK_DAY_MIN_QUESTIONS,
  awardReachedLevels,
  BADGE_FAMILIES,
  badgeStatus,
  bestStreak,
  dayKey,
  DEFAULT_DAILY_GOAL,
  familyValue,
  shiftDay,
  spendRestore,
  streakStatus,
  todayProgress,
  type StreakState,
} from "@/app/lib/streaks";
import { toRoman } from "@/app/lib/roman";
import { SYNC_APPLIED_EVENT } from "@/app/lib/sync";
import type { QuizAttempt } from "@/app/types";

export default function ProgressPage() {
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [dailyGoal, setDailyGoal] = useState(DEFAULT_DAILY_GOAL);
  const [streak, setStreak] = useState<StreakState | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [loaded, setLoaded] = useState(false);

  function refresh() {
    const history = getAllQuizHistory();
    const goal = getSettings().dailyGoal;
    setAttempts(history);
    // Applies (and persists) the monthly top-up when the month rolls over,
    // so every surface reads the same bank. Reached levels are awarded here.
    const current = getStreakState();
    const awarded = awardReachedLevels(current, history, goal);
    setStreak(awarded === current ? current : updateSettings({ streak: awarded }).streak);
    setDailyGoal(goal);
    setNow(new Date());
  }

  useEffect(() => {
    // localStorage is a browser-only external store; one-off read on mount is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    setLoaded(true);
    // A background sync can land attempts — or a cloud-winning streak bank —
    // after mount.
    function onExternalChange() {
      refresh();
    }
    window.addEventListener(SYNC_APPLIED_EVENT, onExternalChange);
    window.addEventListener(SETTINGS_CHANGED_EVENT, onExternalChange);
    return () => {
      window.removeEventListener(SYNC_APPLIED_EVENT, onExternalChange);
      window.removeEventListener(SETTINGS_CHANGED_EVENT, onExternalChange);
    };
  }, []);

  if (!loaded || !streak) return <PageSkeleton />;

  const progress = todayProgress(attempts, dailyGoal, now);
  const status = streakStatus(attempts, streak, now);
  const best = bestStreak(attempts, streak.restoredDays);
  const active = activeDays(attempts, streak.restoredDays);
  const badgeOpts = { goal: dailyGoal, restoredDays: streak.restoredDays };
  const badges = BADGE_FAMILIES.map((family) => {
    const value = familyValue(family.id, attempts, badgeOpts);
    return { family, value, status: badgeStatus(family, value) };
  });
  const goalLeft = Math.max(0, progress.goal - progress.answered);

  // The quiz link goes to the most-used reviewer that still exists.
  const existing = new Set(getReviewers().map((r) => r.id));
  const uses = new Map<string, number>();
  for (const a of attempts) {
    if (existing.has(a.reviewerId)) uses.set(a.reviewerId, (uses.get(a.reviewerId) ?? 0) + 1);
  }
  const topId = [...uses.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const quizHref = topId ? `/reviewer/${topId}/quiz` : "/";

  const today = dayKey(now);
  const week = Array.from({ length: 7 }, (_, i) => {
    const key = shiftDay(today, i - 6);
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const isToday = i === 6;
    const label = isToday ? "Today" : date.toLocaleDateString(undefined, { weekday: "short" });
    const state = streak.restoredDays.includes(key)
      ? "restored"
      : active.has(key)
        ? "active"
        : isToday
          ? "not yet"
          : "missed";
    return { key, label, state, isToday, date: d };
  });

  function onRestore() {
    const missed = restorableDay(attempts, now, streak!.restoredDays);
    if (missed === null) return;
    const next = spendRestore(streak!, missed);
    if (!next) return;
    setStreak(updateSettings({ streak: next }).streak);
  }

  const buttonClass =
    "inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-accent px-6 py-3 text-[0.9375rem] font-semibold text-on-accent hover:bg-accent-hover";
  const section = "mt-8 border-t border-border pt-6";
  const h2 = "text-[0.9375rem] font-semibold text-text-primary";

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <h1 className="text-[1.625rem] font-semibold text-text-primary">Progress</h1>
      <p className="text-[0.9375rem] text-text-secondary">Your daily goal, streak and milestones.</p>

      {attempts.length === 0 ? (
        <div className={section}>
          <h2 className={h2}>Start your first quiz</h2>
          <p className="mt-2 text-[0.9375rem] text-text-secondary">
            Your daily goal is {dailyGoal} questions. Answer {STREAK_DAY_MIN_QUESTIONS} or more in a day to
            make a streak day. Streak days in a row build your streak. If you miss one day, a restore
            repairs it. You get {RESTORES_PER_MONTH} restores each month.
          </p>
          <Link href="/" className={`${buttonClass} mt-4`}>
            Go to your reviewers
          </Link>
        </div>
      ) : (
        <>
          {!progress.done && (
            <div className="mt-6">
              <Link href={quizHref} className={buttonClass}>
                Answer {goalLeft} more
              </Link>
            </div>
          )}

          {status.kind === "restorable" && (
            <div className={section}>
              <p className="text-[0.9375rem] font-medium text-text-primary">
                Your {status.count}-day streak ended yesterday. Restore it now or it is lost.
              </p>
              {streak.banked > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={onRestore} className={buttonClass}>
                    Restore {status.restoredCount}-day streak
                  </button>
                  <span className="text-[0.875rem] text-text-secondary">
                    Uses 1 of {streak.banked} restore{streak.banked === 1 ? "" : "s"}.
                  </span>
                </div>
              ) : (
                <p className="mt-2 text-[0.875rem] text-text-secondary">
                  You have 0 restores, so this streak cannot be repaired.
                </p>
              )}
            </div>
          )}
          {status.kind === "pending" && (
            <div className={section}>
              <p className="text-[0.9375rem] font-medium text-text-primary">
                Your {status.count}-day streak ends tonight. Answer {status.remaining} more to keep it.
              </p>
            </div>
          )}

          <div className={section}>
            <h2 className={h2}>Today&apos;s goal</h2>
            <div className="mt-2 flex items-baseline justify-between gap-3">
              <p className="text-[0.9375rem] text-text-primary">
                <span className="font-mono font-semibold">{progress.answered}</span> of{" "}
                <span className="font-mono">{progress.goal}</span>
              </p>
              <p className="text-[0.875rem] text-text-secondary">
                {progress.done ? "Goal met" : `${goalLeft} more to go`}
              </p>
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-alt"
              role="progressbar"
              aria-valuenow={Math.min(progress.answered, progress.goal)}
              aria-valuemin={0}
              aria-valuemax={progress.goal}
              aria-label="Today's goal progress"
            >
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.min(100, (progress.answered / progress.goal) * 100)}%` }}
              />
            </div>
          </div>

          <div className={section}>
            <h2 className={h2}>Streak</h2>
            {status.count > 0 ? (
              <p className="mt-2 text-[1.1875rem] font-semibold text-text-primary">
                <span className="font-mono">{status.count}</span> {status.count === 1 ? "day" : "days"}{" "}
                <span className="text-[0.875rem] font-normal text-text-secondary">
                  · best: <span className="font-mono">{best}</span>
                </span>
              </p>
            ) : (
              <p className="mt-2 text-[0.9375rem] text-text-secondary">
                No streak yet. Answer {STREAK_DAY_MIN_QUESTIONS} or more questions in a day to start one.
              </p>
            )}
            {/* Connected track: one line with seven day nodes. Node width
                matches the circle, so the line passes through every center. */}
            <ul
              role="list"
              aria-label="Last 7 days"
              className="relative mt-5 flex justify-between px-[18px] md:px-[22px]"
            >
              <span
                aria-hidden="true"
                className="absolute top-[18px] right-[36px] left-[36px] h-[2px] bg-border md:top-[22px] md:right-[44px] md:left-[44px]"
              />
              {week.map((d) => (
                <li
                  key={d.key}
                  aria-label={`${d.label}, ${d.state}`}
                  className="relative flex w-9 flex-col items-center gap-2 text-[0.75rem] text-text-secondary md:w-11"
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-9 w-9 items-center justify-center rounded-full border-2 font-mono text-[0.75rem] md:h-11 md:w-11 md:text-[0.875rem] ${
                      d.state === "active"
                        ? "border-accent bg-accent font-bold text-on-accent"
                        : d.state === "restored"
                          ? "border-dashed border-accent bg-bg font-bold text-text-primary"
                          : d.isToday
                            ? "border-accent bg-bg text-text-primary shadow-[0_0_0_4px_var(--color-accent-subtle)]"
                            : "border-border-strong bg-bg text-text-secondary"
                    }`}
                  >
                    {d.date}
                  </span>
                  <span aria-hidden="true">{d.label}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[0.875rem] text-text-secondary">
              <span className="font-mono">{streak.banked}</span> restore{streak.banked === 1 ? "" : "s"}. Each
              repairs one missed day. Refills to {RESTORES_PER_MONTH} each month if below {RESTORES_PER_MONTH}.
              {streak.pending > 0 && (
                <>
                  {" "}
                  <span className="font-mono">{streak.pending}</span> more waiting: the bank holds{" "}
                  {RESTORES_CAP}.
                </>
              )}
            </p>
          </div>

          <div className={section}>
            <h2 className={h2}>Milestones</h2>
            <p className="mt-1 text-[0.875rem] text-text-secondary">
              Each level-up banks +1 restore automatically.
            </p>
            <ul className="mt-4 divide-y divide-border">
              {badges.map(({ family, value, status: st }) => {
                const maxed = st.nextAt === null;
                const fraction = maxed ? 1 : Math.min(1, value / st.nextAt!);
                return (
                  <li key={family.id} className="py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[0.9375rem] font-semibold text-text-primary">
                        {family.label}
                        {st.level > 0 ? ` ${toRoman(st.level)}` : ""}
                      </p>
                      <p className="font-mono text-[0.875rem] text-text-secondary">
                        {maxed ? (
                          "Maxed"
                        ) : (
                          <>
                            {family.id === "streak" ? "Best " : ""}
                            {value} of {st.nextAt}
                          </>
                        )}
                      </p>
                    </div>
                    <p className="text-[0.875rem] text-text-secondary">{family.description}</p>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-alt">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${Math.round(fraction * 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
