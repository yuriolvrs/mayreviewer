"use client";

import { useEffect, useState } from "react";
import { getAllQuizHistory } from "@/app/lib/storage";
import { getSettings, getStreakState, updateSettings, SETTINGS_CHANGED_EVENT } from "@/app/lib/settings";
import {
  activeDays,
  BADGE_FAMILIES,
  badgeStatus,
  bestStreak,
  claimBadgeLevel,
  computeStreak,
  dayKey,
  DEFAULT_DAILY_GOAL,
  familyValue,
  restorableDay,
  shiftDay,
  spendRestore,
  todayProgress,
  type BadgeFamily,
  type BadgeFamilyId,
  type StreakState,
} from "@/app/lib/streaks";
import { SYNC_APPLIED_EVENT } from "@/app/lib/sync";
import type { QuizAttempt } from "@/app/types";

// Badge levels render as Roman numerals beside the title (Goal Getter I),
// so the progress line underneath carries just the numbers.
function toRoman(n: number): string {
  const table: [number, string][] = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let numeral = "";
  let rest = n;
  for (const [value, symbol] of table) {
    while (rest >= value) {
      numeral += symbol;
      rest -= value;
    }
  }
  return numeral;
}

// Presentation half of the badge system: the medal color per family and one
// consistent hand-drawn stroke icon each. Locked tiles render the same shapes
// in gray — state from color, meaning from the label beside it.
const FAMILY_STYLE: Record<BadgeFamilyId, { color: string; icon: React.ReactNode }> = {
  streak: {
    color: "#22c55e",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
        <path d="M12 2c0 0-7 9-7 14a7 7 0 0 0 14 0c0-5-7-14-7-14z" />
        <path d="M12 22v-6" />
      </svg>
    ),
  },
  questions: {
    color: "#3b82f6",
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
        {/* The Riddler's mark: a question mark is the badge, not decoration. */}
        <text
          x="12"
          y="17.5"
          textAnchor="middle"
          fontSize="16"
          fontWeight="bold"
          fill="currentColor"
          fontFamily="inherit"
        >
          ?
        </text>
      </svg>
    ),
  },
  perfects: {
    color: "#ec4899",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
        <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8-6.1-3.4-6.1 3.4 1.4-6.8-5.1-4.7 6.9-.8L12 2z" />
      </svg>
    ),
  },
  goals: {
    color: "#e8a33f",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
        <path d="M6 3v18" />
        <path d="M6 4h11l-2.5 4L17 12H6" />
      </svg>
    ),
  },
  speed: {
    color: "#ef4444",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
        <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
      </svg>
    ),
  },
  marathon: {
    color: "#a855f7",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
        <path d="M12 3l9 5-9 5-9-5 9-5z" />
        <path d="M3 13l9 5 9-5" />
      </svg>
    ),
  },
  explorer: {
    color: "#6366f1",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M15 9l-2 4-4 2 2-4 4-2z" />
      </svg>
    ),
  },
  owl: {
    color: "#0ea5e9",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
        <path d="M20 13A8 8 0 1 1 11 4a6.5 6.5 0 0 0 9 9z" />
      </svg>
    ),
  },
  bird: {
    color: "#fb7185",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
      </svg>
    ),
  },
};

export default function ProgressPage() {
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [dailyGoal, setDailyGoal] = useState(DEFAULT_DAILY_GOAL);
  const [streak, setStreak] = useState<StreakState | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [loaded, setLoaded] = useState(false);

  function refresh() {
    setAttempts(getAllQuizHistory());
    // Applies (and persists) the monthly top-up when the month rolls over,
    // so every surface reads the same bank.
    setStreak(getStreakState());
    setDailyGoal(getSettings().dailyGoal);
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

  if (!loaded || !streak) return null;

  const progress = todayProgress(attempts, dailyGoal, now);
  const current = computeStreak(attempts, now, streak.restoredDays);
  const restorable = restorableDay(attempts, now, streak.restoredDays);
  const best = bestStreak(attempts, streak.restoredDays);
  const active = activeDays(attempts, streak.restoredDays);
  const badgeOpts = { goal: dailyGoal, restoredDays: streak.restoredDays };
  // One tile per family in stable order — positions never jump when a claim
  // lands; the Claim button carries findability instead.
  const badges = BADGE_FAMILIES.map((family) => {
    const value = familyValue(family.id, attempts, badgeOpts);
    const status = badgeStatus(family, value);
    const claimedUpTo = streak.claimedLevels[family.id] ?? 0;
    return { family, value, status, claimable: status.level > claimedUpTo };
  });
  const unlockedCount = badges.filter((b) => b.status.level > 0).length;

  // The streak a restore would return to — what the button names.
  const restoredCount =
    restorable !== null ? computeStreak(attempts, now, [...streak.restoredDays, restorable]).count : 0;

  const today = dayKey(now);
  const week = Array.from({ length: 7 }, (_, i) => {
    const key = shiftDay(today, i - 6);
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return {
      key,
      hit: active.has(key),
      isToday: i === 6,
      narrow: date.toLocaleDateString(undefined, { weekday: "narrow" }),
      short: i === 6 ? "Today" : date.toLocaleDateString(undefined, { weekday: "short" }),
    };
  });

  const grantLabel = (() => {
    const first = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return `${first.toLocaleDateString(undefined, { month: "short" })} 1`;
  })();

  function onRestore() {
    if (restorable === null) return;
    const next = spendRestore(streak!, restorable);
    if (!next) return;
    setStreak(updateSettings({ streak: next }).streak);
  }

  function onClaim(family: BadgeFamily) {
    const next = claimBadgeLevel(
      streak!,
      family,
      familyValue(family.id, attempts, { goal: dailyGoal, restoredDays: streak!.restoredDays }),
    );
    if (!next) return;
    setStreak(updateSettings({ streak: next }).streak);
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <h1 className="text-[26px] font-semibold text-text-primary">Progress</h1>

      {/* The page's one decisive action: no heading, just the fact and the
          button. Only renders while a restore can still save the streak. */}
      {restorable !== null && (
        <div className="mt-8 border-t border-border pt-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[15px] font-medium text-text-primary">
              Oh no! You forgot to review yesterday.
              <span className="mt-0.5 block text-[13px] font-normal text-text-secondary">
                Restore your streak now or else it will be lost forever (a long time!)
              </span>
            </p>
            <button
              type="button"
              onClick={onRestore}
              className="shrink-0 rounded-lg bg-accent px-6 py-3 text-[15px] font-semibold text-on-accent hover:bg-accent-hover"
            >
              Restore {restoredCount}-day streak
            </button>
          </div>
        </div>
      )}

      <div className="mt-8 border-t border-border pt-6">
        <h2 className="text-[15px] font-semibold text-text-primary">Today&apos;s goal</h2>
        {progress.done ? (
          <p className="mt-2 text-[15px] font-semibold text-text-primary">Goal met</p>
        ) : (
          <>
            <div className="mt-2 flex items-baseline justify-between gap-3">
              <p className="text-[15px] text-text-primary">
                <span className="font-semibold">{progress.answered}</span> of {progress.goal}
              </p>
              <p className="text-[14px] text-text-secondary">
                {progress.goal - progress.answered} more to go
              </p>
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-alt"
              role="progressbar"
              aria-valuenow={progress.answered}
              aria-valuemin={0}
              aria-valuemax={progress.goal}
              aria-label="Today's goal progress"
            >
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.min(100, (progress.answered / progress.goal) * 100)}%` }}
              />
            </div>
          </>
        )}
      </div>

      <div className="mt-8 border-t border-border pt-6">
        <h2 className="text-[15px] font-semibold text-text-primary">Streak</h2>
        {current.count > 0 ? (
          <p className="mt-2 text-[19px] font-semibold text-text-primary">
            {current.count === 1 ? "1 day" : `${current.count} days`}{" "}
            <span className="text-[14px] font-normal text-text-secondary">· best: {best}</span>
          </p>
        ) : (
          <p className="mt-2 text-[15px] text-text-secondary">
            No streak yet — answer 5+ questions today to start one.
          </p>
        )}
        {/* Connected track: one line with the seven days as nodes, so the week
            reads as a single journey. Node columns match the circle size, so
            the line passes exactly through every center. */}
        <div className="relative mt-5 px-[18px] md:px-[22px]">
          <span
            aria-hidden="true"
            className="absolute top-[18px] right-[36px] left-[36px] h-[2px] bg-border md:top-[22px] md:right-[44px] md:left-[44px]"
          />
          <div className="relative flex justify-between" role="img" aria-label={`Active days this week`}>
            {week.map((d) => (
              <span
                key={d.key}
                className="flex w-9 flex-col items-center gap-2 text-[11px] text-text-tertiary md:w-11"
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-[12px] md:h-11 md:w-11 md:text-[14px] ${
                    d.hit
                      ? "border-accent bg-accent font-bold text-on-accent"
                      : d.isToday
                        ? "border-accent bg-bg text-accent shadow-[0_0_0_4px_var(--color-accent-subtle)]"
                        : "border-border-strong bg-bg text-text-tertiary"
                  }`}
                >
                  {d.narrow}
                </span>
                {d.short}
              </span>
            ))}
          </div>
        </div>
        {current.count > 0 && (
          <p className="mt-3 text-[14px] text-text-secondary">
            {current.todayDone
              ? "Answer 5 questions tomorrow to keep it going."
              : `Answer ${Math.max(0, 5 - progress.answered)} today to keep it going.`}
          </p>
        )}
        <p className="mt-2 text-[14px] text-text-secondary">
          {streak.banked} restore{streak.banked === 1 ? "" : "s"} left · tops up to 3 on{" "}
          {grantLabel}.
        </p>
      </div>

      <div className="mt-8 border-t border-border pt-6">
        <h2 className="text-[15px] font-semibold text-text-primary">Milestones</h2>
        <p className="mt-1 text-[14px] text-text-secondary">
          Every level-up banks +1 restore. Unlocked {unlockedCount} of {badges.length}.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          {badges.map(({ family, value, status, claimable }) => {
            const style = FAMILY_STYLE[family.id];
            const locked = status.level === 0;
            const maxed = status.nextAt === null && !locked;
            const fraction =
              status.nextAt === null ? 1 : Math.min(1, value / status.nextAt);
            return (
              <div
                key={family.id}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-5 text-center"
              >
                <span
                  aria-hidden="true"
                  className="flex h-16 w-[70px] items-center justify-center"
                  style={{
                    clipPath: "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)",
                    backgroundColor: locked ? "var(--color-border-strong)" : style.color,
                    color: locked ? "var(--color-text-tertiary)" : "#fff",
                  }}
                >
                  {style.icon}
                </span>
                <p className={`text-[14px] font-semibold ${locked ? "text-text-secondary" : "text-text-primary"}`}>
                  {family.label}
                  {status.level > 0 ? ` ${toRoman(status.level)}` : ""}
                </p>
                <p className="text-[12px] leading-snug text-text-secondary">{family.description}</p>
                <p className={`text-[12px] ${claimable ? "font-semibold text-accent" : "text-text-tertiary"}`}>
                  {/* Streak counts a running best, not a lifetime total — the
                      line says so, so "2 of 7" never reads as "2 done". */}
                  {locked
                    ? value === 0
                      ? "Not started yet"
                      : `${family.id === "streak" ? "Best " : ""}${value} of ${status.nextAt}`
                    : maxed
                      ? "Maxed"
                      : `${family.id === "streak" ? "Best " : ""}${value} of ${status.nextAt}`}
                </p>
                <span className="h-1 w-full max-w-[130px] overflow-hidden rounded-full bg-surface-alt">
                  <span
                    className={`block h-full rounded-full ${locked ? "bg-text-tertiary" : "bg-accent"}`}
                    style={{ width: `${Math.round(fraction * 100)}%` }}
                  />
                </span>
                {claimable && (
                  <button
                    type="button"
                    onClick={() => onClaim(family)}
                    aria-label={`Claim ${family.label} level ${status.level}, plus 1 restore`}
                    className="mt-1.5 shrink-0 rounded-lg bg-accent px-4 py-1.5 text-[13px] font-semibold text-on-accent hover:bg-accent-hover"
                  >
                    Claim +1
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
