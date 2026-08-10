"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { saveReviewer } from "@/app/lib/storage";
import { MAX_QUESTION_COUNT, MIN_QUESTION_COUNT } from "@/app/lib/questions";
import { addAttachment } from "@/app/lib/attachments";
import { parseReviewerFile, type ParsedReviewerFile } from "@/app/lib/reviewerFile";
import type { Reviewer } from "@/app/types";

// Reasonable starting point for a reviewer with no questions yet — matches
// what most first generations ask for, without forcing the max every time.
const DEFAULT_NEW_QUESTION_COUNT = 20;

export default function NewReviewerPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [topics, setTopics] = useState<string[]>([""]);
  const [questionCount, setQuestionCount] = useState(DEFAULT_NEW_QUESTION_COUNT);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState(false);
  // Browsers don't render text-overflow:ellipsis inside <input>, so an unfocused
  // topic is drawn as a real element on top of the (text-transparent) input.
  const [focusedTopic, setFocusedTopic] = useState<number | null>(null);

  const importInputRef = useRef<HTMLInputElement>(null);
  const [importDragOver, setImportDragOver] = useState(false);
  const [importPending, setImportPending] = useState<ParsedReviewerFile | null>(null);
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);

  function updateTopic(index: number, value: string) {
    setTopics((prev) => prev.map((t, i) => (i === index ? value : t)));
  }

  function removeTopic(index: number) {
    setTopics((prev) => prev.filter((_, i) => i !== index));
  }

  function addTopic() {
    setTopics((prev) => [...prev, ""]);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(true);
      return;
    }
    if (
      !Number.isInteger(questionCount) ||
      questionCount < MIN_QUESTION_COUNT ||
      questionCount > MAX_QUESTION_COUNT
    ) {
      setError(
        `Questions to generate must be a whole number between ${MIN_QUESTION_COUNT} and ${MAX_QUESTION_COUNT}.`,
      );
      return;
    }

    const now = new Date().toISOString();
    const reviewer: Reviewer = {
      id: crypto.randomUUID(),
      reviewerName: trimmed,
      subject: subject.trim(),
      topics: topics.map((t) => t.trim()).filter(Boolean),
      notes: "",
      projectMaterial: "",
      questionCount,
      questions: [],
      createdAt: now,
      updatedAt: now,
    };
    saveReviewer(reviewer);
    // Straight to Upload — a brand-new reviewer has no source material yet,
    // and that's the next thing it needs.
    router.push(`/reviewer/${reviewer.id}?tab=upload`);
  }

  async function handleImportFileSelected(file: File) {
    setImportError("");
    setImportPending(null);

    const result = await parseReviewerFile(file);
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    if (!result.data.reviewerName.trim()) {
      setImportError("That file doesn't include a reviewer name.");
      return;
    }
    setImportPending(result.data);
  }

  async function confirmImportCreate() {
    if (!importPending) return;
    setImporting(true);
    try {
      const now = new Date().toISOString();
      const reviewer: Reviewer = {
        id: crypto.randomUUID(),
        reviewerName: importPending.reviewerName.trim(),
        subject: importPending.subject.trim(),
        topics: importPending.topics,
        notes: importPending.notes,
        projectMaterial: importPending.projectMaterial,
        questionCount: importPending.questionCount,
        questions: importPending.questions,
        createdAt: now,
        updatedAt: now,
      };
      saveReviewer(reviewer);

      for (const attachment of importPending.attachments) {
        // .slice() copies into a fresh, exactly-sized ArrayBuffer — safer than
        // trusting the zip entry's own buffer to have no extra offset/padding.
        const bytes = attachment.data.slice();
        const file = new File([bytes.buffer as ArrayBuffer], attachment.name, {
          type: attachment.mimeType,
        });
        await addAttachment(reviewer.id, attachment.field, file);
      }

      router.push(`/reviewer/${reviewer.id}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-8">
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
        <span className="text-text-tertiary">New reviewer</span>
      </nav>

      <h1 className="text-[26px] font-semibold text-text-primary">New reviewer</h1>

      <div className="mt-4">
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json,application/zip,.zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImportFileSelected(file);
            e.target.value = "";
          }}
        />

        {importPending ? (
          <div className="rounded-lg border border-border bg-surface-alt p-4">
            <p className="text-[15px] font-medium text-text-primary">{importPending.fileName}</p>
            <dl className="mt-3 flex flex-col gap-1 text-[14px]">
              <div className="flex gap-2">
                <dt className="text-text-secondary">Reviewer name</dt>
                <dd className="text-text-primary">{importPending.reviewerName}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-text-secondary">Questions in file</dt>
                <dd className="text-text-primary">{importPending.questions.length}</dd>
              </div>
              {importPending.topics.length > 0 && (
                <div className="flex gap-2">
                  <dt className="text-text-secondary">Topics in file</dt>
                  <dd className="text-text-primary">{importPending.topics.length}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="text-text-secondary">Questions to generate</dt>
                <dd className="text-text-primary">{importPending.questionCount}</dd>
              </div>
              {importPending.isArchive && (
                <div className="flex gap-2">
                  <dt className="text-text-secondary">Files in archive</dt>
                  <dd className="text-text-primary">{importPending.attachments.length}</dd>
                </div>
              )}
            </dl>
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setImportPending(null)}
                className="text-[15px] font-medium text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmImportCreate}
                disabled={importing}
                className="rounded-lg bg-accent px-4 py-2 text-[15px] font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {importing ? "Creating…" : "Create from file"}
              </button>
            </div>
          </div>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setImportDragOver(true);
            }}
            onDragLeave={() => setImportDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setImportDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) handleImportFileSelected(file);
            }}
            onClick={() => importInputRef.current?.click()}
            className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
              importDragOver ? "border-accent bg-accent-subtle" : "border-border-strong hover:border-accent"
            }`}
          >
            <p className="text-[15px] font-semibold text-text-primary">Already have an exported reviewer?</p>
            <p className="mt-1 text-[14px] text-text-secondary">
              Drop a <span className="font-mono">.json</span> or <span className="font-mono">.zip</span> file
              here, or click to browse.
            </p>
          </div>
        )}

        {importError && <p className="mt-2 text-[14px] text-error">{importError}</p>}
      </div>

      <div className="my-6 flex items-center gap-4">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[12px] font-medium tracking-wide text-text-tertiary uppercase">
          Or start from scratch
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleCreate} className="flex flex-col">
        <div className="grid grid-cols-[160px_1fr] gap-6 pb-6">
          <div>
            <p className="text-[15px] font-medium text-text-primary">Reviewer info</p>
            <p className="mt-1 text-[14px] text-text-secondary">Name and subject for this reviewer.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[14px] text-text-secondary">
                Reviewer name <span className="text-error">*</span>
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError(false);
                }}
                placeholder="e.g. CPU Scheduling"
                className={`h-11 rounded-lg border px-3 text-text-primary outline-none focus:ring-2 focus:ring-accent/20 ${
                  nameError ? "border-error focus:border-error" : "border-border focus:border-accent"
                }`}
                autoFocus
              />
              {nameError && <span className="text-[13px] text-error">Reviewer name is required.</span>}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[14px] text-text-secondary">Subject (optional)</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Intro to Operating Systems"
                className="h-11 rounded-lg border border-border px-3 text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-[160px_1fr] gap-6 border-t border-border py-6">
          <div>
            <p className="text-[15px] font-medium text-text-primary">Topics</p>
            <p className="mt-1 text-[14px] text-text-secondary">
              Optional. Weights question generation toward these topics.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            {topics.map((topic, index) => {
              const showOverlay = Boolean(topic) && focusedTopic !== index;
              return (
                <div key={index} className="relative">
                  <input
                    type="text"
                    value={topic}
                    title={topic}
                    onChange={(e) => updateTopic(index, e.target.value)}
                    onFocus={() => setFocusedTopic(index)}
                    onBlur={() => setFocusedTopic(null)}
                    placeholder="e.g. Paging"
                    className={`h-11 w-full truncate rounded-lg border border-border pl-3 pr-8 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 ${
                      showOverlay ? "text-transparent" : "text-text-primary"
                    }`}
                  />
                  {showOverlay && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 left-0 right-8 flex items-center truncate pl-3 text-text-primary"
                    >
                      {topic}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeTopic(index)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-error"
                    aria-label="Remove topic"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              onClick={addTopic}
              className="col-span-2 flex h-11 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong text-[15px] font-medium text-text-secondary hover:border-accent hover:text-accent"
            >
              + Add topic
            </button>
          </div>
        </div>

        <div className="grid grid-cols-[160px_1fr] gap-6 border-t border-border py-6">
          <div>
            <p className="text-[15px] font-medium text-text-primary">Generation</p>
            <p className="mt-1 text-[14px] text-text-secondary">How many questions to generate.</p>
          </div>
          <div>
            <input
              type="number"
              min={MIN_QUESTION_COUNT}
              max={MAX_QUESTION_COUNT}
              value={questionCount}
              onChange={(e) => setQuestionCount(e.target.valueAsNumber)}
              aria-label="Questions to generate"
              className="h-11 w-24 rounded-lg border border-border px-3 text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </div>
        </div>

        {error && <p className="pb-2 text-[15px] text-error">{error}</p>}

        <div className="flex justify-end border-t border-border py-6">
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2.5 text-[15px] font-medium text-white hover:bg-accent-hover"
          >
            Create Reviewer
          </button>
        </div>
      </form>
    </div>
  );
}
