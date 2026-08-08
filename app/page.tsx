"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { deleteReviewer, getReviewers, hasQuizHistory } from "@/app/lib/storage";
import type { Reviewer } from "@/app/types";

export default function Home() {
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // localStorage is a browser-only external store; one-off read on mount is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReviewers(getReviewers());
    setLoaded(true);
  }, []);

  function handleDelete(reviewer: Reviewer) {
    const warning = hasQuizHistory(reviewer.id)
      ? `This Reviewer has quiz history — deleting it will also delete that history. Continue?`
      : `Delete this Reviewer and its ${reviewer.questions.length} questions?`;
    if (!window.confirm(warning)) return;
    deleteReviewer(reviewer.id);
    setReviewers(getReviewers());
  }

  if (!loaded) return null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
            pre, May Reviewer ka ba?
          </h1>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            Turn your notes into a practice exam that matches your professor&apos;s question style.
          </p>
        </div>
        <Link
          href="/reviewer/new"
          className="shrink-0 rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          + New Reviewer
        </Link>
      </div>

      {reviewers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No Reviewers yet — create one to get started.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {reviewers.map((reviewer) => (
            <li
              key={reviewer.id}
              className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div>
                <p className="font-medium text-black dark:text-zinc-50">
                  {reviewer.reviewerName}
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {reviewer.questions.length} questions ·{" "}
                  {new Date(reviewer.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href={`/reviewer/${reviewer.id}`}
                  className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-black hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
                >
                  Open
                </Link>
                <button
                  onClick={() => handleDelete(reviewer)}
                  className="rounded-full px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
