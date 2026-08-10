"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatTakenAt, scoreTone } from "@/app/lib/questions";
import { getAllQuizHistory, getReviewers } from "@/app/lib/storage";
import type { QuizAttempt, Reviewer } from "@/app/types";

function ChevronRightIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M4 2l3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
  }, []);

  if (!loaded) return null;

  // Chips only cover reviewers that actually have attempts — an empty chip
  // would just filter down to an empty list.
  const allGroups = groupByReviewer(attempts, reviewers);
  const visibleGroups = filterId ? allGroups.filter((g) => g.reviewerId === filterId) : allGroups;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-6 py-10">
      <h1 className="text-[26px] font-semibold text-text-primary">History</h1>
      <p className="text-[15px] text-text-secondary">
        Every quiz attempt across all Reviewers, newest first.
      </p>

      {attempts.length === 0 ? (
        <p className="mt-4 text-[15px] text-text-secondary">
          No attempts yet. Take a quiz from any Reviewer to see it here.
        </p>
      ) : (
        <>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setFilterId(null)}
              className={`rounded-lg px-2.5 py-1 text-[14px] font-medium ${
                filterId === null
                  ? "bg-accent text-white"
                  : "border border-border-strong text-text-secondary hover:text-text-primary"
              }`}
            >
              All reviewers
            </button>
            {allGroups.map((group) => (
              <button
                key={group.reviewerId}
                onClick={() => setFilterId(group.reviewerId)}
                aria-pressed={filterId === group.reviewerId}
                className={`rounded-lg px-2.5 py-1 text-[14px] font-medium ${
                  filterId === group.reviewerId
                    ? "bg-accent text-white"
                    : "border border-border-strong text-text-secondary hover:text-text-primary"
                }`}
              >
                {group.reviewer?.reviewerName ?? "Deleted reviewer"}
              </button>
            ))}
          </div>

          <div className="mt-2 flex flex-col gap-6">
            {visibleGroups.map((group) => (
              <div key={group.reviewerId}>
                <div className="flex items-center justify-between">
                  {group.reviewer ? (
                    <Link
                      href={`/reviewer/${group.reviewerId}`}
                      className="text-[14px] font-semibold uppercase tracking-wide text-accent hover:underline"
                    >
                      {group.reviewer.reviewerName}
                    </Link>
                  ) : (
                    <span className="text-[14px] font-semibold uppercase tracking-wide text-text-tertiary">
                      Deleted reviewer
                    </span>
                  )}
                  <span className="text-[14px] text-text-tertiary">
                    {group.attempts.length} attempt{group.attempts.length === 1 ? "" : "s"}
                  </span>
                </div>

                <ul className="mt-1 flex flex-col">
                  {group.attempts.map((attempt) => {
                    const percent = Math.round((attempt.score / attempt.total) * 100);
                    const summary = (
                      <>
                        <span className="text-[15px] text-text-secondary">
                          {formatTakenAt(attempt.takenAt)}
                        </span>
                        <span className={`ml-auto shrink-0 font-medium ${scoreTone(percent)}`}>
                          {attempt.score}/{attempt.total} ({percent}%)
                        </span>
                      </>
                    );

                    // Attempts recorded before answers were kept, or whose
                    // reviewer was deleted, have nothing to reopen — they stay
                    // as a plain score line.
                    return (
                      <li key={attempt.id} className="border-t border-border last:border-b">
                        {attempt.questions.length === 0 || !group.reviewer ? (
                          <div className="flex items-center gap-3 py-3">
                            {summary}
                            <span aria-hidden="true" className="w-4 shrink-0" />
                          </div>
                        ) : (
                          <Link
                            href={`/reviewer/${attempt.reviewerId}/quiz?attempt=${attempt.id}`}
                            title="View these results"
                            className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-surface-alt"
                          >
                            {summary}
                            <span className="w-4 shrink-0 text-text-tertiary group-hover:text-text-primary">
                              <ChevronRightIcon />
                            </span>
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
