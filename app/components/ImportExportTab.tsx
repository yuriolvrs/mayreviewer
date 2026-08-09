"use client";

import { useRef, useState } from "react";
import { updateReviewer } from "@/app/lib/storage";
import { isQuestion } from "@/app/lib/questions";
import type { Question, Reviewer } from "@/app/types";

type ExportedReviewer = {
  reviewerName: string;
  subject: string;
  topics: string[];
  notes: string;
  projectMaterial: string;
  questions: Question[];
  createdAt: string;
};

// A parsed, validated file waiting on the user's confirmation — nothing is
// written to the Reviewer until they press Merge.
type PendingImport = {
  fileName: string;
  questions: Question[];
  newQuestions: Question[];
};

export default function ImportExportTab({
  reviewer,
  onImported,
}: {
  reviewer: Reviewer;
  onImported: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState<PendingImport | null>(null);

  function handleExport() {
    const data: ExportedReviewer = {
      reviewerName: reviewer.reviewerName,
      subject: reviewer.subject,
      topics: reviewer.topics,
      notes: reviewer.notes,
      projectMaterial: reviewer.projectMaterial,
      questions: reviewer.questions,
      createdAt: reviewer.createdAt,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reviewer.reviewerName || "reviewer"}.json`;
    a.click();
    // Revoking on the same tick can abort the download in Firefox — let the
    // click be dispatched first.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function handleFileSelected(file: File) {
    setMessage(null);
    setPending(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setMessage({ text: "Couldn't parse that file as valid JSON.", isError: true });
      return;
    }

    // `parsed` can be any JSON value here — including null, which would throw
    // on a property read outside the try above.
    const questions =
      typeof parsed === "object" && parsed !== null
        ? (parsed as { questions?: unknown }).questions
        : undefined;
    if (!Array.isArray(questions) || !questions.every(isQuestion)) {
      setMessage({ text: "That file doesn't look like a valid Reviewer export.", isError: true });
      return;
    }

    const existingIds = new Set(reviewer.questions.map((q) => q.id));
    setPending({
      fileName: file.name,
      questions,
      newQuestions: questions.filter((q) => !existingIds.has(q.id)),
    });
  }

  function confirmMerge() {
    if (!pending) return;
    updateReviewer(reviewer.id, {
      questions: [...reviewer.questions, ...pending.newQuestions],
    });
    onImported();
    setPending(null);
    setMessage({
      text:
        pending.newQuestions.length > 0
          ? `${pending.newQuestions.length} question${pending.newQuestions.length === 1 ? "" : "s"} imported.`
          : "No new questions to import — they're already in this Reviewer.",
      isError: false,
    });
  }

  const duplicates = pending ? pending.questions.length - pending.newQuestions.length : 0;

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[160px_1fr] gap-6 py-6">
        <div>
          <p className="text-[15px] font-medium text-text-primary">Export</p>
          <p className="mt-1 text-[14px] text-text-secondary">
            Download this reviewer as a <span className="font-mono">.json</span> file.
          </p>
        </div>
        <div>
          <button
            onClick={handleExport}
            className="rounded-lg border border-border bg-surface px-4 py-2.5 text-[15px] font-medium text-text-primary hover:border-border-strong"
          >
            Export reviewer JSON
          </button>
          <p className="mt-2 text-[14px] text-text-tertiary">
            Includes info, notes, project material, and questions. Uploaded PDFs stay on this
            device and aren&apos;t part of the file.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[160px_1fr] gap-6 border-t border-border py-6">
        <div>
          <p className="text-[15px] font-medium text-text-primary">Import</p>
          <p className="mt-1 text-[14px] text-text-secondary">
            Merge questions from an exported file into this reviewer&apos;s pool.
          </p>
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelected(file);
              e.target.value = "";
            }}
          />

          {pending ? (
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="shrink-0 rounded bg-accent-subtle px-1.5 py-0.5 text-[12px] font-semibold text-accent"
                >
                  JSON
                </span>
                <span className="min-w-0 break-words text-[15px] text-text-primary">
                  {pending.fileName}
                </span>
              </div>

              <dl className="mt-3 flex flex-col gap-1 text-[14px]">
                <div className="flex gap-2">
                  <dt className="text-text-secondary">Questions in file</dt>
                  <dd className="text-text-primary">{pending.questions.length}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-text-secondary">Total after merge</dt>
                  <dd className="text-text-primary">
                    {reviewer.questions.length + pending.newQuestions.length}
                  </dd>
                </div>
              </dl>

              <p className="mt-3 text-[14px] text-text-tertiary">
                {duplicates > 0
                  ? `${duplicates} question${duplicates === 1 ? " is" : "s are"} already in this reviewer and will be skipped.`
                  : "Questions already in this reviewer are skipped automatically."}
              </p>

              <div className="mt-4 flex items-center justify-end gap-3">
                <button
                  onClick={() => setPending(null)}
                  className="text-[15px] font-medium text-text-secondary hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmMerge}
                  className="rounded-lg bg-accent px-4 py-2 text-[15px] font-medium text-white hover:bg-accent-hover"
                >
                  Merge questions
                </button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) handleFileSelected(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-lg border-2 border-dashed p-9 text-center text-text-secondary ${
                dragOver ? "border-accent bg-accent-subtle" : "border-border"
              }`}
            >
              <p>
                Drop a <span className="font-mono">.json</span> file here, or click to browse.
              </p>
              <p className="mt-1 text-[14px] text-text-tertiary">
                Nothing is merged until you confirm.
              </p>
            </div>
          )}

          <p className="mt-2 text-[14px] text-text-tertiary">
            Doesn&apos;t overwrite this reviewer&apos;s name or content. Questions already in this
            reviewer are skipped automatically, so re-importing the same file changes nothing.
          </p>

          {message && (
            <p className={`mt-2 text-[15px] ${message.isError ? "text-error" : "text-success"}`}>
              {message.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
