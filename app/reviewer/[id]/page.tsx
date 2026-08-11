"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getReviewer } from "@/app/lib/storage";
import { deleteWarning, removeReviewerCompletely } from "@/app/lib/reviewers";
import type { Reviewer } from "@/app/types";
import ImportExportTab from "@/app/components/ImportExportTab";
import DetailsTab from "@/app/components/DetailsTab";
import QuestionsTab from "@/app/components/QuestionsTab";
import ConfirmDialog from "@/app/components/ConfirmDialog";

type Tab = "details" | "questions" | "import-export";

const TABS: { id: Tab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "questions", label: "Questions" },
  { id: "import-export", label: "Import/Export" },
];

// useSearchParams (for the `?tab=` deep link) requires a Suspense boundary
// around anything that calls it, or a production build fails.
export default function ReviewerSpacePage() {
  return (
    <Suspense fallback={null}>
      <ReviewerSpace />
    </Suspense>
  );
}

function ReviewerSpace() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [reviewer, setReviewer] = useState<Reviewer | null | undefined>(undefined);
  // Lets a caller (new-reviewer creation) land directly on a tab other than
  // Details — e.g. `?tab=questions` — instead of only ever opening here first.
  const requestedTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<Tab>(
    TABS.some((t) => t.id === requestedTab) ? (requestedTab as Tab) : "details",
  );
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    // localStorage is a browser-only external store; one-off read on mount is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReviewer(getReviewer(id) ?? null);
  }, [id]);

  function refresh() {
    setReviewer(getReviewer(id) ?? null);
  }

  async function confirmDelete() {
    if (!reviewer) return;
    await removeReviewerCompletely(reviewer.id);
    router.push("/");
  }

  if (reviewer === undefined) return null;

  if (reviewer === null) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <p className="text-text-secondary">Reviewer not found.</p>
        <Link href="/" className="text-[15px] font-medium text-accent underline">
          Back to Home
        </Link>
      </div>
    );
  }

  const hasQuestions = reviewer.questions.length > 0;

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-4xl shrink-0 px-6 pt-8">
        {/* Sits outside the tab switch below, so it holds position while only
            the tab content changes. */}
        <nav
          aria-label="Breadcrumb"
          className="mb-2 flex items-center gap-1.5 text-[12px] tracking-wide uppercase"
        >
          <Link href="/" className="text-text-secondary hover:text-text-primary">
            Reviewers
          </Link>
          <span aria-hidden="true" className="text-text-tertiary">
            /
          </span>
          <span className="text-text-tertiary">{reviewer.reviewerName}</span>
        </nav>

        <div className="flex items-center justify-between gap-3">
          <h1 className="min-w-0 break-words text-[26px] font-semibold text-text-primary">
            {reviewer.reviewerName}
          </h1>
          <div className="flex shrink-0 items-center gap-4">
            {hasQuestions ? (
              <Link
                href={`/reviewer/${reviewer.id}/quiz`}
                className="rounded-lg bg-accent px-4 py-2 text-[15px] font-medium text-white hover:bg-accent-hover"
              >
                Take Quiz
              </Link>
            ) : (
              <span
                title="Generate questions first"
                className="cursor-not-allowed rounded-lg bg-accent px-4 py-2 text-[15px] font-medium text-white opacity-40"
              >
                Take Quiz
              </span>
            )}
          </div>
        </div>

        {/* The three labels are wider than a narrow phone at their desktop
            size, so they step down below `sm`; anything still over scrolls
            inside the nav rather than dragging the whole page sideways. */}
        <nav className="mt-4 flex items-center gap-1 overflow-x-auto border-b border-border-strong">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px shrink-0 rounded-t-md border-b-2 px-2.5 py-2 text-[15px] font-medium whitespace-nowrap sm:px-3 sm:text-[17px] ${
                activeTab === tab.id
                  ? "border-accent bg-accent-subtle text-text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-6 py-10">
        <div>
          {activeTab === "details" && (
            <>
              <p className="mb-4 text-[15px] text-text-secondary">
                {reviewer.questions.length} question
                {reviewer.questions.length === 1 ? "" : "s"} ·{" "}
                {new Date(reviewer.createdAt).toLocaleDateString()}
              </p>
              {!hasQuestions && (
                <p className="mb-4 text-[15px] text-text-secondary">
                  No questions yet — add your source material below, then generate them from the
                  Questions tab.
                </p>
              )}
              <DetailsTab
                reviewer={reviewer}
                onSaved={refresh}
                onDeleteRequest={() => setConfirmDeleteOpen(true)}
              />
            </>
          )}
          {activeTab === "questions" && (
            <QuestionsTab reviewer={reviewer} onChanged={refresh} />
          )}
          {activeTab === "import-export" && (
            <ImportExportTab reviewer={reviewer} onImported={refresh} />
          )}
        </div>
      </div>

      {confirmDeleteOpen && (
        <ConfirmDialog
          title="Delete reviewer?"
          body={deleteWarning(reviewer)}
          confirmLabel="Delete reviewer"
          destructive
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDeleteOpen(false)}
        />
      )}
    </div>
  );
}
