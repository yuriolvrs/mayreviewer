"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { extractTextFromFile } from "@/app/lib/extractText";
import {
  addAttachment,
  getAttachments,
  removeAttachment,
  type Attachment,
  type AttachmentField,
} from "@/app/lib/attachments";

export type UploadedTextFile = {
  id: string;
  name: string;
  // Kept so the row can link to the original file; these entries are
  // session-only (never persisted), so the File is always in memory alongside.
  file: File;
  text: string;
  status: "extracting" | "done" | "error";
  error?: string;
};

function extensionOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function FileTypeBadge({ name }: { name: string }) {
  const ext = extensionOf(name);
  const { label, className } =
    ext === "pdf"
      ? { label: "PDF", className: "bg-error-subtle text-error" }
      : ext === "docx" || ext === "doc"
        ? { label: "DOC", className: "bg-accent-subtle text-accent" }
        : { label: "TXT", className: "bg-surface-alt text-text-secondary" };

  return (
    <span
      aria-hidden="true"
      className={`shrink-0 rounded px-1.5 py-0.5 text-[12px] font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

// Exported for tests — this is the function that guards against the field's
// two producers erasing each other, so it's worth pinning down directly.
export function filesToText(files: UploadedTextFile[]): string {
  return files
    .filter((f) => f.status === "done")
    .map((f) => `--- ${f.name} ---\n${f.text}`)
    .join("\n\n");
}

// This field's saved value has two producers: the textarea, and the text
// extracted from DOCX/TXT uploads this session. They used to write the parent
// independently, so whichever fired last won — adding a PDF while text was
// pasted saved `""` over the notes, and the textarea kept showing the old text
// so the loss stayed invisible until reload. Every write now goes through here
// instead, composing both parts, so no producer can erase the other.
//
// Extracted text is session-only (`textFiles` resets on remount) while the
// pasted side is restored from `initialText` — which is the previously composed
// value. Appending rather than replacing is what makes a file added after a tab
// switch add to the field instead of replacing everything before it.
export function compose(pasted: string, files: UploadedTextFile[]): string {
  return [pasted, filesToText(files)].filter((part) => part.trim().length > 0).join("\n\n");
}

function isPdf(file: File): boolean {
  return file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
}

const ACCEPTED = ".pdf,.docx,.txt";

export type SaveStatus = "idle" | "saving" | "saved";

export default function ContentField({
  label,
  initialText,
  onChange,
  placeholder,
  surfaceClassName = "bg-surface",
  reviewerId,
  field,
  status = "idle",
}: {
  label: string;
  initialText: string;
  // `immediate` skips the parent's debounce — used for file add/remove, where
  // there's no typing to wait out.
  onChange: (text: string, immediate?: boolean) => void;
  placeholder: string;
  surfaceClassName?: string;
  reviewerId: string;
  field: AttachmentField;
  status?: SaveStatus;
}) {
  const [mode, setMode] = useState<"upload" | "paste">(initialText ? "paste" : "upload");
  const [pasteText, setPasteText] = useState(initialText);
  const [textFiles, setTextFiles] = useState<UploadedTextFile[]>([]);
  const [pdfAttachments, setPdfAttachments] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isFirstRender = useRef(true);
  const textFilesRef = useRef(textFiles);
  const pasteTextRef = useRef(pasteText);

  useEffect(() => {
    textFilesRef.current = textFiles;
  }, [textFiles]);

  // Both halves of the composed value are passed explicitly where the caller
  // already knows the new one; the refs cover the async paths (a PDF write
  // finishing, an extraction resolving) that only have the older half to hand.
  function emit(pasted: string, files: UploadedTextFile[], immediate?: boolean) {
    onChange(compose(pasted, files), immediate);
  }

  // Both sources are already fully in memory (IndexedDB bytes for PDFs, the
  // original File for DOCX/TXT), so rows can link straight to a blob URL —
  // no file-serving endpoint needed. Revoked when the list changes/unmounts.
  const pdfUrls = useMemo(
    () =>
      Object.fromEntries(
        pdfAttachments.map((a) => [
          a.id,
          URL.createObjectURL(new Blob([a.data], { type: a.mimeType })),
        ]),
      ),
    [pdfAttachments],
  );

  useEffect(
    () => () => {
      Object.values(pdfUrls).forEach(URL.revokeObjectURL);
    },
    [pdfUrls],
  );

  const textUrls = useMemo(
    () => Object.fromEntries(textFiles.map((f) => [f.id, URL.createObjectURL(f.file)])),
    [textFiles],
  );

  useEffect(
    () => () => {
      Object.values(textUrls).forEach(URL.revokeObjectURL);
    },
    [textUrls],
  );

  // PDFs live in IndexedDB, not in the saved text — ping the parent anyway so
  // the save indicator reflects that attachments changed. The value re-sent
  // here is the unchanged composed text, never a bare file-text string.
  function notifyAttachmentChange() {
    emit(pasteTextRef.current, textFilesRef.current, true);
  }

  useEffect(() => {
    getAttachments(reviewerId, field).then(setPdfAttachments);
  }, [reviewerId, field]);

  // textFiles only change in response to a user action (add/remove/extraction
  // finishing) — report the combined text up to the parent here rather than
  // inside the setTextFiles updater, since updaters must stay pure.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    emit(pasteTextRef.current, textFiles, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textFiles]);

  async function addFiles(incoming: File[]) {
    const pdfs = incoming.filter(isPdf);
    const others = incoming.filter((f) => !isPdf(f));

    for (const file of pdfs) {
      const attachment = await addAttachment(reviewerId, field, file);
      setPdfAttachments((prev) => [...prev, attachment]);
    }
    if (pdfs.length) notifyAttachmentChange();

    const entries: UploadedTextFile[] = others.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      file: f,
      text: "",
      status: "extracting",
    }));
    setTextFiles((prev) => [...prev, ...entries]);

    others.forEach((file, i) => {
      const entryId = entries[i].id;
      extractTextFromFile(file)
        .then((text) => {
          setTextFiles((prev) =>
            prev.map((f) => (f.id === entryId ? { ...f, text, status: "done" as const } : f)),
          );
        })
        .catch((err: unknown) => {
          setTextFiles((prev) =>
            prev.map((f) =>
              f.id === entryId
                ? { ...f, status: "error" as const, error: err instanceof Error ? err.message : "Couldn't read this file." }
                : f,
            ),
          );
        });
    });
  }

  function removeTextFile(id: string) {
    setTextFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function removePdfAttachment(id: string) {
    await removeAttachment(id);
    setPdfAttachments((prev) => prev.filter((a) => a.id !== id));
    notifyAttachmentChange();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-medium text-text-secondary">{label}</span>
        {status === "saving" && (
          <span className="text-[14px] text-text-tertiary">Saving…</span>
        )}
        {status === "saved" && <span className="text-[14px] text-success">✓ Saved</span>}
      </div>

      <div className="flex gap-4 border-b border-border">
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`-mb-px border-b-2 py-2 text-[15px] font-medium ${
            mode === "upload"
              ? "border-accent text-text-primary"
              : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
        >
          Upload files
        </button>
        <button
          type="button"
          onClick={() => setMode("paste")}
          className={`-mb-px border-b-2 py-2 text-[15px] font-medium ${
            mode === "paste"
              ? "border-accent text-text-primary"
              : "border-transparent text-text-secondary hover:text-text-primary"
          }`}
        >
          Paste text
        </button>
      </div>

      {mode === "paste" ? (
        <textarea
          value={pasteText}
          onChange={(e) => {
            // Ref updated eagerly: a file action later in the same tick has to
            // compose against what was just typed, not the pre-render value.
            pasteTextRef.current = e.target.value;
            setPasteText(e.target.value);
            emit(e.target.value, textFilesRef.current);
          }}
          placeholder={placeholder}
          className={`min-h-[220px] rounded-lg border border-border ${surfaceClassName} p-4 font-mono text-[16px] leading-[22px] text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20`}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(Array.from(e.dataTransfer.files));
            }}
            onClick={() => inputRef.current?.click()}
            className={`cursor-pointer rounded-lg border-2 border-dashed p-9 text-center text-text-secondary ${
              dragOver ? "border-accent bg-accent-subtle" : "border-border"
            }`}
          >
            <p>Drop PDF, DOCX, or TXT files here, or click to browse.</p>
            
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
          </div>

          {(pdfAttachments.length > 0 || textFiles.length > 0) && (
            <ul className="divide-y divide-border">
              {pdfAttachments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <FileTypeBadge name={a.name} />
                    <a
                      href={pdfUrls[a.id]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-words text-[15px] text-text-primary hover:text-accent hover:underline"
                    >
                      {a.name}
                    </a>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span className="text-[14px] text-text-tertiary">sent as-is</span>
                    <button
                      type="button"
                      onClick={() => removePdfAttachment(a.id)}
                      className="text-[15px] text-text-secondary hover:text-error"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
              {textFiles.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <FileTypeBadge name={f.name} />
                    <a
                      href={textUrls[f.id]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-words text-[15px] text-text-primary hover:text-accent hover:underline"
                    >
                      {f.name}
                    </a>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    {f.status === "extracting" && (
                      <span className="text-[14px] text-text-tertiary">Extracting…</span>
                    )}
                    {f.status === "done" && (
                      <span className="text-[14px] text-text-tertiary">converted to text</span>
                    )}
                    {f.status === "error" && <span className="text-[14px] text-error">{f.error}</span>}
                    <button
                      type="button"
                      onClick={() => removeTextFile(f.id)}
                      className="text-[15px] text-text-secondary hover:text-error"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
