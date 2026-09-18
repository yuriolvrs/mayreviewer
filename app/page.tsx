"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getAllQuizHistory, getReviewers } from "@/app/lib/storage";
import { getSettings } from "@/app/lib/settings";
import { DEFAULT_DAILY_GOAL, todayProgress } from "@/app/lib/streaks";
import { SYNC_APPLIED_EVENT } from "@/app/lib/sync";
import { removeReviewerCompletely } from "@/app/lib/reviewers";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import EmptyReviewers from "@/app/components/EmptyReviewers";
import type { Reviewer } from "@/app/types";

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

export default function Home() {
  const router = useRouter();
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showWelcome, setShowWelcome] = useState(false);
  // Attempts + goal feed the daily strip below the header. Refreshed on the
  // same sync-applied signal as the list — a second device's quizzes land
  // after mount too.
  const [attempts, setAttempts] = useState<{ takenAt: string; total: number }[]>([]);
  const [dailyGoal, setDailyGoal] = useState(DEFAULT_DAILY_GOAL);
  // "Now" refreshes with the same reads (mount, every sync tick) so the
  // strip rolls over at midnight without a reload and re-renders cheaply.
  const [now, setNow] = useState(() => new Date());
  const selectAllRef = useRef<HTMLInputElement>(null);

  function refreshDaily() {
    setAttempts(getAllQuizHistory());
    setDailyGoal(getSettings().dailyGoal);
    setNow(new Date());
  }

  useEffect(() => {
    // localStorage is a browser-only external store; one-off read on mount is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReviewers(getReviewers());
    setLoaded(true);
    refreshDaily();
    // A background sync can land reviewers after mount (second device) — the
    // list re-reads instead of sitting stale until the next navigation.
    function onSyncApplied() {
      setReviewers(getReviewers());
      refreshDaily();
    }
    window.addEventListener(SYNC_APPLIED_EVENT, onSyncApplied);
    // One-time confirmation after account creation (?welcome=1 from /login):
    // show the banner, then strip the param so refresh and back-navigation
    // never re-show it.
    const url = new URL(window.location.href);
    if (url.searchParams.get("welcome") === "1") {
      setShowWelcome(true);
      url.searchParams.delete("welcome");
      const query = url.searchParams.toString();
      window.history.replaceState(null, "", `${url.pathname}${query ? `?${query}` : ""}${url.hash}`);
    }
    return () => window.removeEventListener(SYNC_APPLIED_EVENT, onSyncApplied);
  }, []);

  function toggleSelected(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  const term = search.trim().toLowerCase();
  const progress = todayProgress(attempts, dailyGoal, now);
  const visible = term
    ? reviewers.filter(
        (r) =>
          r.reviewerName.toLowerCase().includes(term) ||
          r.subject.toLowerCase().includes(term) ||
          r.topics.some((t) => t.toLowerCase().includes(term)),
      )
    : reviewers;

  // Selection follows the search: selecting all with a filter applied never
  // reaches reviewers the filter is hiding.
  const allSelected = visible.length > 0 && visible.every((r) => selected.includes(r.id));
  const someSelected = visible.some((r) => selected.includes(r.id));

  // Set outside render: mutating the DOM node during render is a side effect.
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = !allSelected && someSelected;
    }
  }, [allSelected, someSelected]);

  function toggleSelectAll() {
    setSelected(allSelected ? [] : visible.map((r) => r.id));
  }

  async function confirmBulkDelete() {
    setConfirmBulkDeleteOpen(false);
    await Promise.all(selected.map((id) => removeReviewerCompletely(id)));
    setSelected([]);
    setReviewers(getReviewers());
  }

  if (!loaded) return null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      {showWelcome && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-lg bg-surface-alt px-3 py-2">
          <p className="text-[14px] text-text-secondary">
            <span className="font-semibold text-text-primary">Account created — you&apos;re signed in.</span>{" "}
            Your reviewers now sync across devices.
          </p>
          <button
            onClick={() => setShowWelcome(false)}
            aria-label="Dismiss welcome message"
            className="flex min-h-[44px] min-w-[44px] flex-none items-center justify-center rounded-md text-[18px] text-text-secondary hover:text-text-primary"
          >
            ×
          </button>
        </div>
      )}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[34px] font-bold leading-10 tracking-tight text-text-primary">
            Reviewers
          </h1>
          <p className="mt-1 text-[15px] text-text-secondary">
            Turn your notes into a practice exam.
          </p>
        </div>
        <Link
          href="/reviewer/new"
          className="shrink-0 rounded-lg bg-accent px-4 py-2.5 text-[15px] font-medium text-on-accent hover:bg-accent-hover"
        >
          + New Reviewer
        </Link>
      </div>

      {reviewers.length > 0 && (
        <p role="status" className="text-[14px] text-text-secondary">
          {progress.done ? "Goal met" : `Today ${progress.answered}/${progress.goal}`}
        </p>
      )}

      {reviewers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <EmptyReviewers />
        </div>
      ) : (
        <>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reviewers…"
            aria-label="Search reviewers"
            className="h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-[15px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent"
          />
          {term && (
            <p className="text-[14px] text-text-secondary" role="status">
              {visible.length} of {reviewers.length} reviewer{reviewers.length === 1 ? "" : "s"} shown
            </p>
          )}
          {visible.length === 0 ? (
            <p className="text-[15px] text-text-secondary">
              No reviewers match “{search.trim()}”.
            </p>
          ) : (
          <>
          {/* Swaps to the bulk action bar the moment anything is selected, same
              select-all/bulk-actions pattern as the Edit Questions tab. */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={allSelected}
              ref={selectAllRef}
              onChange={toggleSelectAll}
              aria-label={`Select all ${visible.length} reviewer${visible.length === 1 ? "" : "s"}`}
              className="h-4 w-4 shrink-0 accent-accent"
            />
            {selected.length === 0 ? (
              <span className="text-[15px] text-text-secondary">
                Select all {visible.length} reviewer{visible.length === 1 ? "" : "s"}
              </span>
            ) : (
              <>
                <span className="text-[15px] text-text-primary">{selected.length} selected</span>
                <div className="ml-auto flex items-center gap-4 text-[14px]">
                  <button
                    onClick={() => setSelected([])}
                    className="font-medium text-text-secondary hover:text-text-primary"
                  >
                    Clear selection
                  </button>
                  <button
                    onClick={() => setConfirmBulkDeleteOpen(true)}
                    className="font-medium text-error hover:underline"
                  >
                    Delete selected
                  </button>
                </div>
              </>
            )}
          </div>

          <ul className="flex flex-col gap-3">
            {visible.map((reviewer) => (
              <li key={reviewer.id}>
                {/* A div (not a <button>) so the selection checkbox can nest
                    inside it — a real button can't validly contain one. */}
                <div
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(`/reviewer/${reviewer.id}`)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    // The selection checkbox nests inside the row: interacting
                    // with it must toggle, not navigate.
                    if ((e.target as HTMLElement).closest("input,button,textarea,select,a")) return;
                    e.preventDefault();
                    router.push(`/reviewer/${reviewer.id}`);
                  }}
                  aria-label={`Open ${reviewer.reviewerName}`}
                  className="group flex cursor-pointer items-center gap-4 rounded-lg border border-border bg-surface p-6 hover:border-border-strong"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(reviewer.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSelected(reviewer.id)}
                    aria-label={`Select ${reviewer.reviewerName}`}
                    className="h-4 w-4 shrink-0 accent-accent"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[19px] font-semibold text-text-primary">
                      {reviewer.reviewerName}
                    </p>
                    <p className="mt-1 text-[15px] text-text-secondary">
                      {reviewer.questions.length} question
                      {reviewer.questions.length === 1 ? "" : "s"} ·{" "}
                      {new Date(reviewer.updatedAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <span className="shrink-0 text-text-tertiary group-hover:text-text-primary">
                    <ChevronRightIcon />
                  </span>
                </div>
              </li>
            ))}
          </ul>
          </>
          )}
        </>
      )}

      {confirmBulkDeleteOpen && (
        <ConfirmDialog
          title={`Delete ${selected.length} reviewer${selected.length === 1 ? "" : "s"}?`}
          body={`This will permanently delete ${selected.length} reviewer${
            selected.length === 1 ? "" : "s"
          }, including their questions, quiz history, and uploaded files. This can't be undone.`}
          confirmLabel={`Delete ${selected.length} reviewer${selected.length === 1 ? "" : "s"}`}
          destructive
          onConfirm={confirmBulkDelete}
          onCancel={() => setConfirmBulkDeleteOpen(false)}
        />
      )}
    </div>
  );
}
