"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { newId } from "@/app/lib/ids";
import { extractTextFromFile } from "@/app/lib/extractText";
import {
  ACCEPTED_UPLOAD_EXTENSIONS,
  HEIC_GUIDANCE,
  isHeicFile,
} from "@/app/lib/attachmentLimits";
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
      : ["jpg", "jpeg", "png", "webp"].includes(ext)
        ? { label: "IMG", className: "bg-info-subtle text-info" }
        : ext === "docx" || ext === "doc"
          ? { label: "DOC", className: "bg-accent-subtle text-accent" }
          : ext === "cpp"
            ? { label: "CPP", className: "bg-accent-subtle text-accent" }
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

// PDFs and images travel to the model as-is (native vision) and live in
// IndexedDB rather than the saved text; everything else is extracted to text.
function isStoredFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return (
    lower.endsWith(".pdf") ||
    [".jpg", ".jpeg", ".png", ".webp"].some((ext) => lower.endsWith(ext)) ||
    file.type === "application/pdf" ||
    file.type.startsWith("image/")
  );
}

export default function ContentField({
  initialText,
  onChange,
  placeholder,
  surfaceClassName = "bg-surface",
  reviewerId,
  field,
}: {
  initialText: string;
  // `immediate` skips the parent's debounce — used for file add/remove, where
  // there's no typing to wait out.
  onChange: (text: string, immediate?: boolean) => void;
  placeholder: string;
  surfaceClassName?: string;
  reviewerId: string;
  field: AttachmentField;
}) {
  const [mode, setMode] = useState<"upload" | "paste">(initialText ? "paste" : "upload");
  const [pasteText, setPasteText] = useState(initialText);
  const [textFiles, setTextFiles] = useState<UploadedTextFile[]>([]);
  const [fileAttachments, setFileAttachments] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState("");
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

  // Both sources are already fully in memory (IndexedDB bytes for stored
  // files, the original File for DOCX/TXT), so rows can link straight to a
  // blob URL — no file-serving endpoint needed. Revoked when the list
  // changes/unmounts.
  const fileUrls = useMemo(
    () =>
      Object.fromEntries(
        fileAttachments.map((a) => [
          a.id,
          URL.createObjectURL(new Blob([a.data], { type: a.mimeType })),
        ]),
      ),
    [fileAttachments],
  );

  useEffect(
    () => () => {
      Object.values(fileUrls).forEach(URL.revokeObjectURL);
    },
    [fileUrls],
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

  // Stored files live in IndexedDB, not in the saved text — ping the parent
  // anyway so the save indicator reflects that attachments changed. The value
  // re-sent here is the unchanged composed text, never a bare file-text string.
  function notifyAttachmentChange() {
    emit(pasteTextRef.current, textFilesRef.current, true);
  }

  useEffect(() => {
    getAttachments(reviewerId, field).then(setFileAttachments);
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
    const heic = incoming.filter((f) => isHeicFile(f.name, f.type));
    const rest = incoming.filter((f) => !isHeicFile(f.name, f.type));
    // HEIC is rejected with guidance rather than silently dropped — iPhone
    // photos default to it and the picker can't filter it reliably.
    setFileError(heic.length > 0 ? HEIC_GUIDANCE : "");
    const stored = rest.filter(isStoredFile);
    const others = rest.filter((f) => !isStoredFile(f));

    for (const file of stored) {
      const attachment = await addAttachment(reviewerId, field, file);
      setFileAttachments((prev) => [...prev, attachment]);
    }
    if (stored.length) notifyAttachmentChange();

    const entries: UploadedTextFile[] = others.map((f) => ({
      id: newId(),
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

  async function removeFileAttachment(id: string) {
    await removeAttachment(id);
    setFileAttachments((prev) => prev.filter((a) => a.id !== id));
    notifyAttachmentChange();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-4 border-b border-border" role="tablist" aria-label="Content input mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "upload"}
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
          role="tab"
          aria-selected={mode === "paste"}
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
          aria-label={placeholder}
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
            <p>Drop PDF, image, DOCX, TXT, or CPP files here, or click to browse.</p>
            {fileError && (
              <p className="mx-auto mt-2 max-w-md text-[14px] text-error">{fileError}</p>
            )}

            {/* Visually hidden but focusable, so keyboard users reach a
                native file input instead of a div pretending to be one. */}
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_UPLOAD_EXTENSIONS}
              multiple
              aria-label="Upload files"
              className="sr-only"
              onChange={(e) => {
                if (e.target.files) addFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
          </div>

          {(fileAttachments.length > 0 || textFiles.length > 0) && (
            <ul className="divide-y divide-border">
              {fileAttachments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <FileTypeBadge name={a.name} />
                    <a
                      href={fileUrls[a.id]}
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
                      onClick={() => removeFileAttachment(a.id)}
                      aria-label={`Remove ${a.name}`}
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
                    <span aria-live="polite" className="text-[14px] text-text-tertiary">
                      {f.status === "extracting" && "Extracting…"}
                      {f.status === "done" && "converted to text"}
                    </span>
                    {f.status === "error" && <span className="text-[14px] text-error">{f.error}</span>}
                    <button
                      type="button"
                      onClick={() => removeTextFile(f.id)}
                      aria-label={`Remove ${f.name}`}
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
