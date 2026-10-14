"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getReviewer } from "@/app/lib/storage";
import { deleteWarning, removeReviewerCompletely } from "@/app/lib/reviewers";
import { resolveFromList } from "@/app/lib/examFormats";
import { useFormats } from "@/app/lib/useFormats";
import type { Reviewer } from "@/app/types";
import PageSkeleton from "@/app/components/PageSkeleton";
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
  const formats = useFormats();

  // Follows `?tab=` after mount too, so a client navigation that only changes
  // the query (rather than remounting) still lands on the requested tab.
  useEffect(() => {
    if (TABS.some((t) => t.id === requestedTab)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab(requestedTab as Tab);
    }
  }, [requestedTab]);

  useEffect(() => {
    // localStorage is a browser-only external store; one-off read on mount is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReviewer(getReviewer(id) ?? null);
  }, [id]);

  // Arrow keys move and activate the neighbouring tab (wrapping); Home/End
  // jump to the ends. Focus follows so the roving tabindex stays in sync.
  function onTabKeyDown(e: React.KeyboardEvent, index: number) {
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setActiveTab(TABS[next].id);
    document.getElementById(`tab-${TABS[next].id}`)?.focus();
  }

  function refresh() {
    setReviewer(getReviewer(id) ?? null);
  }

  async function confirmDelete() {
    if (!reviewer) return;
    await removeReviewerCompletely(reviewer.id);
    router.push("/");
  }

  if (reviewer === undefined) return <PageSkeleton maxWidth="max-w-4xl" />;

  if (reviewer === null) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <p className="text-text-secondary">Reviewer not found.</p>
        <Link href="/" className="text-[0.9375rem] font-medium text-accent underline">
          Back to Home
        </Link>
      </div>
    );
  }

  const hasQuestions = reviewer.questions.length > 0;
  const format = resolveFromList(formats, reviewer.examFormatId);

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-4xl shrink-0 px-6 pt-8">
        {/* Sits outside the tab switch below, so it holds position while only
            the tab content changes. */}
        <nav
          aria-label="Breadcrumb"
          className="mb-2 flex items-center gap-1.5 text-[0.75rem] tracking-wide uppercase"
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
          <h1 className="min-w-0 break-words text-[1.625rem] font-semibold text-text-primary">
            {reviewer.reviewerName}
          </h1>
          <div className="flex shrink-0 items-center gap-4">
            {hasQuestions ? (
              <Link
                href={`/reviewer/${reviewer.id}/quiz`}
                className="inline-flex min-h-[44px] items-center rounded-lg bg-accent px-4 py-2 text-[0.9375rem] font-medium text-on-accent hover:bg-accent-hover"
              >
                Take quiz
              </Link>
            ) : (
              <button
                type="button"
                disabled
                title="Generate questions first"
                aria-disabled="true"
                aria-describedby="take-quiz-reason"
                className="inline-flex min-h-[44px] cursor-not-allowed items-center rounded-lg bg-accent px-4 py-2 text-[0.9375rem] font-medium text-on-accent opacity-40"
              >
                Take quiz
              </button>
            )}
          </div>
        </div>
        {!hasQuestions && (
          <p id="take-quiz-reason" className="mt-1 text-[0.875rem] text-text-secondary">
            Generate questions in the Questions tab to take a quiz.
          </p>
        )}
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[0.875rem] text-text-secondary">
          <span>Format: {format.name}</span>
          <span aria-hidden="true" className="text-text-tertiary">
            ·
          </span>
          <Link
            href={`/formats/${format.id}`}
            className="inline-flex min-h-[44px] items-center font-medium text-accent underline"
          >
            View format
          </Link>
        </p>

        {/* The three labels are wider than a narrow phone at their desktop
            size, so they step down below `sm`; anything still over scrolls
            inside the nav rather than dragging the whole page sideways. */}
        {/* `pb-px` absorbs the tabs' `-mb-px` overhang so the horizontal
            scroll container doesn't also report 1px of vertical overflow
            (which renders a stray vertical scrollbar on Windows). */}
        <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-px border-b border-border-strong">
          <div role="tablist" aria-label="Reviewer sections" className="flex items-center gap-1">
          {TABS.map((tab, i) => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
              className={`-mb-px inline-flex min-h-[44px] shrink-0 items-center rounded-t-md border-b-2 px-2.5 py-2 text-[0.9375rem] font-medium whitespace-nowrap sm:px-3 sm:text-[1.0625rem] ${
                activeTab === tab.id
                  ? "border-accent bg-accent-subtle text-text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-6 py-10">
        <div role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
          {activeTab === "details" && (
            <>
              <p className="mb-4 text-[0.9375rem] text-text-secondary">
                {reviewer.questions.length} question
                {reviewer.questions.length === 1 ? "" : "s"} ·{" "}
                {new Date(reviewer.createdAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
              {!hasQuestions && (
                <p className="mb-4 text-[0.9375rem] text-text-secondary">
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
