"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AttemptList } from "@/app/components/AttemptRow";
import PageSkeleton from "@/app/components/PageSkeleton";
import { attemptPercent } from "@/app/lib/questions";
import { getAllQuizHistory, getReviewers } from "@/app/lib/storage";
import { SYNC_APPLIED_EVENT } from "@/app/lib/sync";
import type { QuizAttempt, Reviewer } from "@/app/types";

type Group = { reviewer: Reviewer | undefined; reviewerId: string; attempts: QuizAttempt[] };

// Attempts arrive newest-first; grouping by first-seen reviewerId keeps that
// ordering at the group level too, so the reviewer with the most recent
// activity leads the page.
function groupByReviewer(attempts: QuizAttempt[], reviewers: Record<string, Reviewer>): Group[] {
  const groups: Group[] = [];
  const index = new Map<string, Group>();
  for (const attempt of attempts) {
    let group = index.get(attempt.reviewerId);
    if (!group) {
      group = { reviewer: reviewers[attempt.reviewerId], reviewerId: attempt.reviewerId, attempts: [] };
      index.set(attempt.reviewerId, group);
      groups.push(group);
    }
    group.attempts.push(attempt);
  }
  return groups;
}

export default function HistoryPage() {
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [reviewers, setReviewers] = useState<Record<string, Reviewer>>({});
  const [loaded, setLoaded] = useState(false);
  // null means "All reviewers".
  const [filterId, setFilterId] = useState<string | null>(null);

  useEffect(() => {
    // localStorage is a browser-only external store; one-off read on mount is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAttempts(getAllQuizHistory());
    setReviewers(Object.fromEntries(getReviewers().map((r) => [r.id, r])));
    setLoaded(true);
    // Same staleness guard as home: a background sync can land attempts
    // after mount.
    function onSyncApplied() {
      setAttempts(getAllQuizHistory());
      setReviewers(Object.fromEntries(getReviewers().map((r) => [r.id, r])));
    }
    window.addEventListener(SYNC_APPLIED_EVENT, onSyncApplied);
    return () => window.removeEventListener(SYNC_APPLIED_EVENT, onSyncApplied);
  }, []);

  if (!loaded) return <PageSkeleton maxWidth="max-w-4xl" />;

  // Chips only cover reviewers that actually have attempts — an empty chip
  // would just filter down to an empty list.
  const allGroups = groupByReviewer(attempts, reviewers);
  const visibleGroups = filterId ? allGroups.filter((g) => g.reviewerId === filterId) : allGroups;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-6 py-10">
      <h1 className="text-[1.625rem] font-semibold text-text-primary">History</h1>
      <p className="text-[0.9375rem] text-text-secondary">
        Every quiz attempt across all reviewers, newest first.
      </p>

      {attempts.length === 0 ? (
        <p className="mt-4 text-[0.9375rem] text-text-secondary">
          No attempts yet. Take a quiz from any reviewer to see it here.
        </p>
      ) : (
        <>
          {/* One scrolling row, not a wrapping wall of chips. */}
          <div className="mt-1 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[{ id: null as string | null, label: "All reviewers" }, ...allGroups.map((g) => ({
              id: g.reviewerId as string | null,
              label: g.reviewer?.reviewerName ?? "Deleted reviewer",
            }))].map((chip) => (
              <button
                key={chip.id ?? "all"}
                onClick={() => setFilterId(chip.id)}
                aria-pressed={filterId === chip.id}
                className={`min-h-11 shrink-0 whitespace-nowrap rounded-lg px-3 text-[0.875rem] font-medium md:min-h-9 ${
                  filterId === chip.id
                    ? "bg-accent text-on-accent"
                    : "border border-border-strong text-text-secondary hover:text-text-primary"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="mt-2 flex flex-col gap-6">
            {visibleGroups.map((group) => {
              const percents = group.attempts
                .map(attemptPercent)
                .filter((p): p is number => p !== null);
              // Attempts are newest-first, so the first valid score is the latest.
              const latest = percents[0];
              const best = percents.length > 0 ? Math.max(...percents) : undefined;
              return (
                <div key={group.reviewerId}>
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                    {group.reviewer ? (
                      <Link
                        href={`/reviewer/${group.reviewerId}`}
                        className="inline-flex min-h-11 items-center text-[1rem] font-semibold text-text-primary hover:underline sm:min-h-0"
                      >
                        {group.reviewer.reviewerName}
                      </Link>
                    ) : (
                      <span className="text-[1rem] font-semibold text-text-tertiary">
                        Deleted reviewer
                      </span>
                    )}
                    <span className="text-[0.875rem] text-text-tertiary">
                      {group.attempts.length} attempt{group.attempts.length === 1 ? "" : "s"}
                      {latest !== undefined && (
                        <>
                          {" · Latest "}
                          <span className="font-mono">{latest}%</span>
                          {" · Best "}
                          <span className="font-mono">{best}%</span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="mt-1">
                    <AttemptList
                      attempts={group.attempts}
                      hrefFor={(attempt) =>
                        group.reviewer ? `/reviewer/${attempt.reviewerId}/quiz?attempt=${attempt.id}` : undefined
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
