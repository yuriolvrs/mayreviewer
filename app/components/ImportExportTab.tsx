"use client";

import { useRef, useState } from "react";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { updateReviewer } from "@/app/lib/storage";
import { isQuestion } from "@/app/lib/questions";
import { getAttachments, addAttachment, type AttachmentField } from "@/app/lib/attachments";
import type { Question, Reviewer } from "@/app/types";

type AttachmentManifestEntry = {
  id: string;
  field: AttachmentField;
  name: string;
  mimeType: string;
  path: string;
};

function isAttachmentManifestEntry(value: unknown): value is AttachmentManifestEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    (v.field === "notes" || v.field === "project") &&
    typeof v.name === "string" &&
    typeof v.mimeType === "string" &&
    typeof v.path === "string"
  );
}

type ExportedReviewer = {
  reviewerName: string;
  subject: string;
  topics: string[];
  notes: string;
  projectMaterial: string;
  questions: Question[];
  createdAt: string;
  attachments?: AttachmentManifestEntry[];
};

// A zip entry's path can't contain the file's own name verbatim if that name
// carries a slash — keeps the archive's `files/` folder from getting a bogus
// nested path out of an unusual PDF filename.
function zipSafeName(name: string): string {
  return name.replace(/[/\\]/g, "_");
}

type PendingAttachment = AttachmentManifestEntry & { data: Uint8Array };

// A parsed, validated file waiting on the user's confirmation — nothing is
// written to the Reviewer until they press Merge.
type PendingImport = {
  fileName: string;
  isArchive: boolean;
  questions: Question[];
  newQuestions: Question[];
  totalAttachments: number;
  newAttachments: PendingAttachment[];
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
  const [exporting, setExporting] = useState(false);

  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    // Revoking on the same tick can abort the download in Firefox — let the
    // click be dispatched first.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

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
    download(blob, `${reviewer.reviewerName || "reviewer"}.json`);
  }

  async function handleExportWithMaterials() {
    setExporting(true);
    try {
      const attachments = await getAttachments(reviewer.id);
      const manifest: AttachmentManifestEntry[] = attachments.map((a) => ({
        id: a.id,
        field: a.field,
        name: a.name,
        mimeType: a.mimeType,
        path: `files/${a.id}__${zipSafeName(a.name)}`,
      }));

      const data: ExportedReviewer = {
        reviewerName: reviewer.reviewerName,
        subject: reviewer.subject,
        topics: reviewer.topics,
        notes: reviewer.notes,
        projectMaterial: reviewer.projectMaterial,
        questions: reviewer.questions,
        createdAt: reviewer.createdAt,
        attachments: manifest,
      };

      const files: Record<string, Uint8Array> = {
        "reviewer.json": strToU8(JSON.stringify(data, null, 2)),
      };
      attachments.forEach((a, i) => {
        files[manifest[i].path] = new Uint8Array(a.data);
      });

      const zipped = zipSync(files);
      // fflate's output buffer is always a plain ArrayBuffer in the browser;
      // its type is widened to ArrayBufferLike, which BlobPart doesn't accept.
      const blob = new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" });
      download(blob, `${reviewer.reviewerName || "reviewer"}.zip`);
    } finally {
      setExporting(false);
    }
  }

  async function handleFileSelected(file: File) {
    setMessage(null);
    setPending(null);

    const isArchive = file.name.toLowerCase().endsWith(".zip");
    let reviewerJsonText: string;
    let zipEntries: Record<string, Uint8Array> | null = null;

    if (isArchive) {
      try {
        zipEntries = unzipSync(new Uint8Array(await file.arrayBuffer()));
      } catch {
        setMessage({ text: "Couldn't read that file as a valid .zip archive.", isError: true });
        return;
      }
      const reviewerEntry = zipEntries["reviewer.json"];
      if (!reviewerEntry) {
        setMessage({ text: "That archive doesn't contain a reviewer.json.", isError: true });
        return;
      }
      reviewerJsonText = strFromU8(reviewerEntry);
    } else {
      reviewerJsonText = await file.text();
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(reviewerJsonText);
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
    const newQuestions = questions.filter((q) => !existingIds.has(q.id));

    let totalAttachments = 0;
    let newAttachments: PendingAttachment[] = [];
    if (zipEntries) {
      const manifestRaw =
        typeof parsed === "object" && parsed !== null
          ? (parsed as { attachments?: unknown }).attachments
          : undefined;
      const manifest = Array.isArray(manifestRaw) ? manifestRaw.filter(isAttachmentManifestEntry) : [];
      totalAttachments = manifest.length;

      const existingAttachmentIds = new Set((await getAttachments(reviewer.id)).map((a) => a.id));
      const entries = zipEntries;
      newAttachments = manifest
        .filter((m) => !existingAttachmentIds.has(m.id) && entries[m.path])
        .map((m) => ({ ...m, data: entries[m.path] }));
    }

    setPending({
      fileName: file.name,
      isArchive,
      questions,
      newQuestions,
      totalAttachments,
      newAttachments,
    });
  }

  async function confirmMerge() {
    if (!pending) return;
    updateReviewer(reviewer.id, {
      questions: [...reviewer.questions, ...pending.newQuestions],
    });
    for (const attachment of pending.newAttachments) {
      // .slice() copies into a fresh, exactly-sized ArrayBuffer — safer than
      // trusting the zip entry's own buffer to have no extra offset/padding.
      const bytes = attachment.data.slice();
      const file = new File([bytes.buffer as ArrayBuffer], attachment.name, {
        type: attachment.mimeType,
      });
      await addAttachment(reviewer.id, attachment.field, file);
    }

    onImported();
    setPending(null);

    const parts: string[] = [];
    parts.push(
      pending.newQuestions.length > 0
        ? `${pending.newQuestions.length} question${pending.newQuestions.length === 1 ? "" : "s"}`
        : "no new questions",
    );
    if (pending.isArchive) {
      parts.push(
        pending.newAttachments.length > 0
          ? `${pending.newAttachments.length} file${pending.newAttachments.length === 1 ? "" : "s"}`
          : "no new files",
      );
    }
    setMessage({ text: `Imported ${parts.join(" and ")}.`, isError: false });
  }

  const duplicateQuestions = pending ? pending.questions.length - pending.newQuestions.length : 0;
  const duplicateAttachments = pending ? pending.totalAttachments - pending.newAttachments.length : 0;

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[160px_1fr] gap-6 py-6">
        <div>
          <p className="text-[15px] font-medium text-text-primary">Export</p>
          <p className="mt-1 text-[14px] text-text-secondary">
            Download this reviewer as a <span className="font-mono">.json</span> or{" "}
            <span className="font-mono">.zip</span> file.
          </p>
        </div>
        <div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleExport}
              className="rounded-lg border border-border bg-surface px-4 py-2.5 text-[15px] font-medium text-text-primary hover:border-border-strong"
            >
              Export reviewer JSON
            </button>
            <button
              onClick={handleExportWithMaterials}
              disabled={exporting}
              className="rounded-lg border border-border bg-surface px-4 py-2.5 text-[15px] font-medium text-text-primary hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-40"
            >
              {exporting ? "Zipping…" : "Export with uploaded files (.zip)"}
            </button>
          </div>
          <p className="mt-2 text-[14px] text-text-tertiary">
            The JSON export includes info, text notes, project material, and questions, but not
            the uploaded files. The zip export includes the JSON export and bundles those files together.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[160px_1fr] gap-6 border-t border-border py-6">
        <div>
          <p className="text-[15px] font-medium text-text-primary">Import</p>
          <p className="mt-1 text-[14px] text-text-secondary">
            Merge a <span className="font-mono">.json</span> or <span className="font-mono">.zip</span>{" "}
            export into this reviewer&apos;s pool.
          </p>
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json,application/zip,.zip"
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
                  {pending.isArchive ? "ZIP" : "JSON"}
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
                {pending.isArchive && (
                  <div className="flex gap-2">
                    <dt className="text-text-secondary">Files in archive</dt>
                    <dd className="text-text-primary">
                      {pending.totalAttachments} ({pending.newAttachments.length} new)
                    </dd>
                  </div>
                )}
              </dl>

              <p className="mt-3 text-[14px] text-text-tertiary">
                {duplicateQuestions > 0
                  ? `${duplicateQuestions} question${duplicateQuestions === 1 ? " is" : "s are"} already in this reviewer and will be skipped.`
                  : "Questions already in this reviewer are skipped automatically."}
                {pending.isArchive && duplicateAttachments > 0
                  ? ` ${duplicateAttachments} file${duplicateAttachments === 1 ? " is" : "s are"} already attached and will be skipped.`
                  : ""}
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
                  Merge
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
                Drop a <span className="font-mono">.json</span> or{" "}
                <span className="font-mono">.zip</span> file here, or click to browse.
              </p>
            </div>
          )}

          <p className="mt-2 text-[14px] text-text-tertiary">
            Doesn&apos;t overwrite this reviewer&apos;s name or content. Questions and files
            already in this reviewer are skipped automatically, so re-importing the same file
            changes nothing.
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
