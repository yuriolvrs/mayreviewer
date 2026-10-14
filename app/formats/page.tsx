"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import PageSkeleton from "@/app/components/PageSkeleton";
import { ANSWER_FORMAT_LABEL } from "@/app/components/FormatPreview";
import {
  deleteCustomFormat,
  getBuiltinFormats,
  getCustomFormats,
  type ExamFormat,
} from "@/app/lib/examFormats";
import { deleteFormatAttachments } from "@/app/lib/attachments";
import { consumeFormatSaved } from "@/app/lib/formatSaved";
import { getReviewers } from "@/app/lib/storage";
import { SYNC_APPLIED_EVENT } from "@/app/lib/sync";

function FormatCard({
  format,
  custom,
  usageCount,
  onDeleteRequest,
}: {
  format: ExamFormat;
  custom: boolean;
  usageCount: number;
  onDeleteRequest: (() => void) | null;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-6">
      <div>
        <p className="text-[1.1875rem] font-semibold text-text-primary">{format.name}</p>
        {format.description && (
          <p className="mt-1 text-[0.9375rem] text-text-secondary">{format.description}</p>
        )}
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[0.8125rem] tracking-wide text-text-tertiary uppercase">
          {[...new Set(format.types.map((t) => t.format))].map((f) => (
            <span key={f}>{ANSWER_FORMAT_LABEL[f]}</span>
          ))}
        </p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {format.types.map((t) => (
          <li key={t.key} className="flex items-baseline justify-between gap-3 text-[0.9375rem]">
            <span className="text-text-primary">{t.label}</span>
            <span className="shrink-0 text-text-secondary">
              {t.defaultCount} question{t.defaultCount === 1 ? "" : "s"} default
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Link
          href={`/reviewer/new?format=${encodeURIComponent(format.id)}`}
          className="inline-flex min-h-11 items-center text-[0.875rem] font-medium text-accent hover:underline"
        >
          New reviewer with this format
        </Link>
        <div className="ml-auto flex items-center gap-4 text-[0.875rem]">
          <Link
            href={`/formats/${format.id}`}
            className="inline-flex min-h-11 items-center font-medium text-text-secondary hover:text-text-primary"
          >
            {custom ? "Edit" : "View"}
          </Link>
          <Link
            href={`/formats/new?from=${encodeURIComponent(format.id)}`}
            className="inline-flex min-h-11 items-center font-medium text-text-secondary hover:text-text-primary"
          >
            Clone
          </Link>
          {onDeleteRequest && (
            <button
              type="button"
              onClick={onDeleteRequest}
              className="min-h-11 font-medium text-error hover:underline"
            >
              Delete
            </button>
          )}
        </div>
      </div>
      {custom && usageCount > 0 && (
        <p className="text-[0.8125rem] text-text-tertiary">
          {usageCount} reviewer{usageCount === 1 ? "" : "s"} use{usageCount === 1 ? "s" : ""} this
          format.
        </p>
      )}
    </li>
  );
}

export default function FormatsPage() {
  const [customs, setCustoms] = useState<ExamFormat[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ExamFormat | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  // Read once: a strict-mode effect re-run would find the flag already gone.
  const savedFlag = useRef<boolean | null>(null);

  // Stable across renders (setters + store reads only); the mount effect
  // subscribes the first copy intentionally.
  function refresh() {
    setCustoms(getCustomFormats());
    const counts: Record<string, number> = {};
    for (const r of getReviewers()) counts[r.examFormatId] = (counts[r.examFormatId] ?? 0) + 1;
    setUsage(counts);
  }

  useEffect(() => {
    // localStorage is a browser-only external store; one-off read on mount is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    setLoaded(true);
    if (savedFlag.current === null) savedFlag.current = consumeFormatSaved();
    setJustSaved(savedFlag.current);
    // Same staleness guard as home: a background sync can land formats or
    // reviewers (usage counts) after mount.
    window.addEventListener(SYNC_APPLIED_EVENT, refresh);
    return () => window.removeEventListener(SYNC_APPLIED_EVENT, refresh);
  }, []);

  // Deleting a format also drops its past-exam files from IndexedDB, so no
  // orphaned entries survive under a deleted id. Reviewers on it keep their
  // questions and fall back to the built-in on resolve. The list refreshes
  // even if the file delete fails — the record is already gone.
  async function confirmDeleteFormat() {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    setConfirmDelete(null);
    deleteCustomFormat(id);
    try {
      await deleteFormatAttachments(id);
    } finally {
      refresh();
    }
  }

  if (!loaded) return <PageSkeleton />;
  const builtins = getBuiltinFormats();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[2.125rem] font-bold leading-10 tracking-tight text-text-primary">
            Exam formats
          </h1>
          <p className="mt-1 text-[0.9375rem] text-text-secondary">
            Pick a question format for your reviewers.
          </p>
        </div>
        <Link
          href="/formats/new"
          className="shrink-0 rounded-lg bg-accent px-4 py-2.5 text-[0.9375rem] font-medium text-on-accent hover:bg-accent-hover"
        >
          + New format
        </Link>
      </div>

      {justSaved && (
        <p role="status" className="text-[0.9375rem] text-success">
          ✓ Format saved
        </p>
      )}

      {customs.length > 0 && (
        <>
          <h2 className="text-[0.9375rem] font-semibold text-text-primary">Your formats</h2>
          <ul className="flex flex-col gap-3">
            {customs.map((format) => (
              <FormatCard
                key={format.id}
                format={format}
                custom
                usageCount={usage[format.id] ?? 0}
                onDeleteRequest={() => setConfirmDelete(format)}
              />
            ))}
          </ul>
        </>
      )}

      <div>
        <h2 className="text-[0.9375rem] font-semibold text-text-primary">Built-in formats</h2>
        <ul className="mt-2 flex flex-col gap-3">
        {builtins.map((format) => (
          <FormatCard
            key={format.id}
            format={format}
            custom={false}
            usageCount={0}
            onDeleteRequest={null}
          />
        ))}
        </ul>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${confirmDelete.name}"?`}
          body={
            (usage[confirmDelete.id] ?? 0) > 0
              ? `${usage[confirmDelete.id]} reviewer${usage[confirmDelete.id] === 1 ? "" : "s"} use${usage[confirmDelete.id] === 1 ? "s" : ""} this format — ${usage[confirmDelete.id] === 1 ? "it" : "they"} will fall back to the default format, keeping ${usage[confirmDelete.id] === 1 ? "its" : "their"} questions. This can't be undone.`
              : "No reviewers use this format. This can't be undone."
          }
          confirmLabel="Delete format"
          destructive
          onConfirm={confirmDeleteFormat}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
