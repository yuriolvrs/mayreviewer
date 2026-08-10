"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getReviewers } from "@/app/lib/storage";
import { removeReviewerCompletely } from "@/app/lib/reviewers";
import ConfirmDialog from "@/app/components/ConfirmDialog";
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

  useEffect(() => {
    // localStorage is a browser-only external store; one-off read on mount is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReviewers(getReviewers());
    setLoaded(true);
  }, []);

  function toggleSelected(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  const allSelected = reviewers.length > 0 && reviewers.every((r) => selected.includes(r.id));
  const someSelected = reviewers.some((r) => selected.includes(r.id));

  function toggleSelectAll() {
    setSelected(allSelected ? [] : reviewers.map((r) => r.id));
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
          className="shrink-0 rounded-lg bg-accent px-4 py-2.5 text-[18px] font-medium text-white hover:bg-accent-hover"
        >
          + New Reviewer
        </Link>
      </div>

      {reviewers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-[17px] font-semibold text-text-primary">No reviewers yet</p>
          <p className="mt-1 text-[15px] text-text-secondary">
            Create one to turn your notes into a practice exam.
          </p>
        </div>
      ) : (
        <>
          {/* Swaps to the bulk action bar the moment anything is selected, same
              select-all/bulk-actions pattern as the Edit Questions tab. */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = !allSelected && someSelected;
              }}
              onChange={toggleSelectAll}
              aria-label={`Select all ${reviewers.length} reviewer${reviewers.length === 1 ? "" : "s"}`}
              className="h-4 w-4 shrink-0 accent-accent"
            />
            {selected.length === 0 ? (
              <span className="text-[15px] text-text-secondary">
                Select all {reviewers.length} reviewer{reviewers.length === 1 ? "" : "s"}
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
            {reviewers.map((reviewer) => (
              <li key={reviewer.id}>
                {/* A div (not a <button>) so the selection checkbox can nest
                    inside it — a real button can't validly contain one. */}
                <div
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(`/reviewer/${reviewer.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") router.push(`/reviewer/${reviewer.id}`);
                  }}
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
                      {new Date(reviewer.updatedAt).toLocaleDateString()}
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
