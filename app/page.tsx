"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getReviewers } from "@/app/lib/storage";
import { deleteWarning, removeReviewerCompletely } from "@/app/lib/reviewers";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import type { Reviewer } from "@/app/types";

export default function Home() {
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Reviewer | null>(null);

  useEffect(() => {
    // localStorage is a browser-only external store; one-off read on mount is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReviewers(getReviewers());
    setLoaded(true);
  }, []);

  async function confirmDelete(reviewer: Reviewer) {
    setPendingDelete(null);
    await removeReviewerCompletely(reviewer.id);
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
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-text-secondary">
          No Reviewers yet — create one to get started.
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {reviewers.map((reviewer) => (
            <li
              key={reviewer.id}
              className="flex items-center justify-between rounded-lg border border-border bg-surface p-6"
            >
              <div>
                <p className="text-[19px] font-semibold text-text-primary">
                  {reviewer.reviewerName}
                </p>
                <p className="mt-1 text-[15px] text-text-secondary">
                  {reviewer.questions.length} question
                  {reviewer.questions.length === 1 ? "" : "s"} ·{" "}
                  {new Date(reviewer.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href={`/reviewer/${reviewer.id}`}
                  className="rounded-lg border border-border bg-white px-4 py-2.5 text-[18px] font-medium text-text-primary hover:border-border-strong"
                >
                  Open
                </Link>
                <button
                  onClick={() => setPendingDelete(reviewer)}
                  className="rounded-lg px-4 py-2.5 text-[18px] font-medium text-error hover:bg-error-subtle"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete reviewer?"
          body={deleteWarning(pendingDelete)}
          confirmLabel="Delete reviewer"
          destructive
          onConfirm={() => confirmDelete(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
