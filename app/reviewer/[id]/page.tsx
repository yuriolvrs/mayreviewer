"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { deleteReviewer, getReviewer, hasQuizHistory, saveReviewer } from "@/app/lib/storage";
import type { Reviewer } from "@/app/types";

type Tab = "upload" | "edit" | "import-export";

const TABS: { id: Tab; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "edit", label: "Edit Questions" },
  { id: "import-export", label: "Import/Export" },
];

export default function ReviewerSpacePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [reviewer, setReviewer] = useState<Reviewer | null | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  useEffect(() => {
    // localStorage is a browser-only external store; one-off read on mount is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReviewer(getReviewer(id) ?? null);
  }, [id]);

  function refresh() {
    setReviewer(getReviewer(id) ?? null);
  }

  function handleSaveName() {
    if (!reviewer) return;
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== reviewer.reviewerName) {
      saveReviewer({ ...reviewer, reviewerName: trimmed });
      refresh();
    }
    setEditingName(false);
  }

  function handleDelete() {
    if (!reviewer) return;
    const warning = hasQuizHistory(reviewer.id)
      ? `This Reviewer has quiz history — deleting it will also delete that history. Continue?`
      : `Delete this Reviewer and its ${reviewer.questions.length} questions?`;
    if (!window.confirm(warning)) return;
    deleteReviewer(reviewer.id);
    router.push("/");
  }

  if (reviewer === undefined) return null;

  if (reviewer === null) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <p className="text-zinc-600 dark:text-zinc-400">Reviewer not found.</p>
        <Link href="/" className="text-sm font-medium underline">
          Back to Home
        </Link>
      </div>
    );
  }

  const hasQuestions = reviewer.questions.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <Link href="/" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
        ← Home
      </Link>

      <div className="flex flex-col gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            {editingName ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") setEditingName(false);
                }}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-2xl font-semibold text-black outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            ) : (
              <h1
                onClick={() => {
                  setNameDraft(reviewer.reviewerName);
                  setEditingName(true);
                }}
                className="cursor-text text-2xl font-semibold text-black hover:opacity-70 dark:text-zinc-50"
                title="Click to rename"
              >
                {reviewer.reviewerName}
              </h1>
            )}
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {reviewer.questions.length} questions ·{" "}
              {new Date(reviewer.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              disabled={!hasQuestions}
              title={hasQuestions ? undefined : "No questions yet — generate some in the Upload tab first"}
              className="rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white enabled:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:enabled:hover:bg-zinc-200"
            >
              Quiz this Reviewer
            </button>
            <button
              onClick={handleDelete}
              className="rounded-full px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
            >
              Delete Reviewer
            </button>
          </div>
        </div>
        {!hasQuestions && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No questions yet — generate some in the Upload tab first.
          </p>
        )}
      </div>

      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-black text-black dark:border-white dark:text-white"
                : "border-transparent text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="text-zinc-500 dark:text-zinc-400">
        {activeTab === "upload" && <p>Upload tab — content + question generation coming in Phase 2 &amp; 4.</p>}
        {activeTab === "edit" && <p>Edit Questions tab — coming in Phase 5.</p>}
        {activeTab === "import-export" && <p>Import/Export tab — coming in Phase 3.</p>}
      </div>
    </div>
  );
}
