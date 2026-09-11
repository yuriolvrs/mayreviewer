"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { extractTextFromFile } from "@/app/lib/extractText";
import {
  ACCEPTED_UPLOAD_EXTENSIONS,
  HEIC_GUIDANCE,
  isHeicFile,
} from "@/app/lib/attachmentLimits";
import {
  MAX_EXAMPLES,
  MAX_PAST_EXAM_CHARS,
  newTypeKey,
  type AnswerFormat,
  type ExamFormat,
  type FormatTypeDef,
  type InferredType,
  type StimulusKind,
  type TypeShape,
  type UnsupportedNote,
} from "@/app/lib/examFormats";
import {
  addFormatAttachment,
  getFormatAttachments,
  removeFormatAttachment,
  type FormatAttachment,
} from "@/app/lib/attachments";
import { MAX_QUESTION_COUNT } from "@/app/lib/questions";
import ConfirmDialog from "@/app/components/ConfirmDialog";

// One row of the builder: everything about a single question type. Counts
// are held as text so a field can sit empty while it's being retyped — the
// same reason QuestionCountControl does it.
type TypeDraft = {
  key: string;
  label: string;
  format: AnswerFormat;
  shape: TypeShape;
  stimulus: StimulusKind;
  guidance: string;
  examples: string[];
  countText: string;
};

const FORMAT_OPTIONS: { value: AnswerFormat; label: string; hint: string }[] = [
  { value: "mc", label: "Multiple choice", hint: "4 options, one correct" },
  { value: "true-false", label: "True / False", hint: "2 options" },
  { value: "modified-tf", label: "Modified True/False", hint: "statements + combination options" },
];

const SHAPE_OPTIONS: { value: TypeShape; label: string; hint: string }[] = [
  { value: "standalone", label: "Standalone", hint: "each question on its own" },
  { value: "set", label: "Problem set", hint: "several questions share one problem" },
];

const STIMULUS_OPTIONS: { value: StimulusKind; label: string }[] = [
  { value: "none", label: "None" },
  { value: "prose", label: "Prose passage" },
  { value: "table", label: "Table" },
  { value: "code", label: "Code listing" },
  { value: "formula", label: "Formula / worked stem" },
];

function toDraft(t: FormatTypeDef): TypeDraft {
  return {
    key: t.key,
    label: t.label,
    format: t.format,
    shape: t.shape,
    stimulus: t.stimulus,
    guidance: t.guidance ?? "",
    examples: t.examples ?? [],
    countText: String(t.defaultCount),
  };
}

function blankDraft(label = ""): TypeDraft {
  return {
    key: newTypeKey(label || "type"),
    label,
    format: "mc",
    shape: "standalone",
    stimulus: "none",
    guidance: "",
    examples: [],
    countText: "5",
  };
}

export default function FormatBuilder({
  initial,
  formatId,
  saveLabel,
  onSave,
}: {
  // Blank for new formats, a clone for copies, the stored custom for edits.
  // Keys arrive stable and stay stable — renames must never orphan counts.
  initial: ExamFormat;
  // The format's own id, used to key its past-exam file attachments in
  // IndexedDB. Stable for the page's lifetime (minted once by the parent).
  formatId: string;
  saveLabel: string;
  onSave: (format: ExamFormat) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [types, setTypes] = useState<TypeDraft[]>(initial.types.map(toDraft));
  const [error, setError] = useState("");

  // Past-exam state: files live in the format-attachments store under
  // formatId from the moment they're added (same immediate-save pattern as
  // reviewer PDFs); text is composed at save time into the format record.
  const [pastText, setPastText] = useState(initial.pastExam?.text ?? "");
  const [extracted, setExtracted] = useState<{ id: string; name: string; text: string }[]>([]);
  const [storedFiles, setStoredFiles] = useState<FormatAttachment[]>([]);
  const [pastFileError, setPastFileError] = useState("");
  const [inferState, setInferState] = useState<"idle" | "running" | "error">("idle");
  const [inferError, setInferError] = useState("");
  const [unsupported, setUnsupported] = useState<UnsupportedNote[]>([]);
  const [confirmReplace, setConfirmReplace] = useState<InferredType[] | null>(null);
  const pastInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getFormatAttachments(formatId).then(setStoredFiles);
  }, [formatId]);

  function pastExamText(): string {
    const parts = [pastText, ...extracted.map((f) => `--- ${f.name} ---\n${f.text}`)].filter(
      (part) => part.trim().length > 0,
    );
    const composed = parts.join("\n\n");
    return composed.length > MAX_PAST_EXAM_CHARS
      ? `${composed.slice(0, MAX_PAST_EXAM_CHARS)}\n[...truncated]`
      : composed;
  }

  async function addPastFiles(incoming: File[]) {
    const heic = incoming.filter((f) => isHeicFile(f.name, f.type));
    const rest = incoming.filter((f) => !isHeicFile(f.name, f.type));
    setPastFileError(heic.length > 0 ? HEIC_GUIDANCE : "");
    const lower = (name: string) => name.toLowerCase();
    const native = rest.filter(
      (f) =>
        lower(f.name).endsWith(".pdf") ||
        [".jpg", ".jpeg", ".png", ".webp"].some((ext) => lower(f.name).endsWith(ext)) ||
        f.type === "application/pdf" ||
        f.type.startsWith("image/"),
    );
    const textables = rest.filter(
      (f) =>
        !(
          lower(f.name).endsWith(".pdf") ||
          [".jpg", ".jpeg", ".png", ".webp"].some((ext) => lower(f.name).endsWith(ext)) ||
          f.type === "application/pdf" ||
          f.type.startsWith("image/")
        ),
    );

    for (const file of native) {
      const attachment = await addFormatAttachment(formatId, file);
      setStoredFiles((prev) => [...prev, attachment]);
    }
    for (const file of textables) {
      try {
        const text = await extractTextFromFile(file);
        setExtracted((prev) => [...prev, { id: crypto.randomUUID(), name: file.name, text }]);
      } catch {
        setPastFileError(`Couldn't read "${file.name}" as text.`);
      }
    }
  }

  async function removeStoredFile(id: string) {
    await removeFormatAttachment(id);
    setStoredFiles((prev) => prev.filter((a) => a.id !== id));
  }

  function draftFromInferred(t: InferredType): TypeDraft {
    return {
      key: newTypeKey(t.label),
      label: t.label,
      format: t.answerFormat,
      shape: t.shape,
      stimulus: t.stimulusKind,
      guidance: t.guidance,
      examples: t.example ? [t.example] : [],
      countText: String(t.suggestedCount),
    };
  }

  function applyInferred(drafts: InferredType[]) {
    setTypes(drafts.map(draftFromInferred));
    setConfirmReplace(null);
  }

  async function runInference() {
    setInferState("running");
    setInferError("");
    setUnsupported([]);
    try {
      // Files relay through Blob storage past the Function's body limit —
      // the same relay generation uses for reviewer attachments.
      const attachments = await Promise.all(
        storedFiles.map(async (a) => {
          const blob = await upload(`past-exam/${formatId}/${a.id}-${a.name}`, new Blob([a.data], { type: a.mimeType }), {
            access: "public",
            handleUploadUrl: "/api/blob-upload",
          });
          return { name: a.name, mimeType: a.mimeType, url: blob.url, field: "pastexam" };
        }),
      );
      const res = await fetch("/api/infer-format", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachments, text: pastExamText() }),
      });
      const data = (await res.json()) as {
        types?: InferredType[];
        unsupported?: UnsupportedNote[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Inference failed.");
      setUnsupported(data.unsupported ?? []);
      const drafts = data.types ?? [];
      if (drafts.length === 0) {
        setInferError(
          data.unsupported && data.unsupported.length > 0
            ? "No supported formats found — see the flagged entries below."
            : "No question formats recognized in that material.",
        );
      } else if (types.length > 0) {
        // Replacing hand-built types silently would erase real work.
        setConfirmReplace(drafts);
      } else {
        applyInferred(drafts);
      }
    } catch (err) {
      setInferError(err instanceof Error ? err.message : "Inference failed.");
    } finally {
      setInferState("idle");
    }
  }

  function patch(index: number, change: Partial<TypeDraft>) {
    setTypes((prev) => prev.map((t, i) => (i === index ? { ...t, ...change } : t)));
  }

  function handleSave() {
    if (!name.trim()) return setError("Give the format a name.");
    if (types.length === 0) return setError("Add at least one question type.");
    for (const t of types) {
      if (!t.label.trim()) return setError("Every type needs a label.");
      const n = parseInt(t.countText, 10);
      if (!Number.isInteger(n) || n < 0 || n > MAX_QUESTION_COUNT)
        return setError(`"${t.label || "Unnamed type"}": count must be 0–${MAX_QUESTION_COUNT}.`);
    }
    setError("");
    const pastText = pastExamText();
    onSave({
      id: initial.id,
      name: name.trim(),
      description: description.trim(),
      ...(pastText
        ? {
            pastExam: {
              fileName: storedFiles[0]?.name ?? "pasted text",
              text: pastText,
              addedAt: new Date().toISOString(),
            },
          }
        : {}),
      types: types.map((t) => ({
        key: t.key,
        label: t.label.trim(),
        format: t.format,
        shape: t.shape,
        stimulus: t.stimulus,
        guidance: t.guidance.trim(),
        examples: t.examples.map((e) => e.trim()).filter(Boolean).slice(0, MAX_EXAMPLES),
        defaultCount: parseInt(t.countText, 10),
      })),
    });
  }

  const totalDefault = types.reduce((sum, t) => {
    const n = parseInt(t.countText, 10);
    return sum + (Number.isInteger(n) && n > 0 ? n : 0);
  }, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] text-text-secondary">
            Format name <span className="text-error">*</span>
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Math 101 — my prof's format"
            className="h-11 rounded-lg border border-border px-3 text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] text-text-secondary">Description (optional)</span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What exam is this for?"
            className="h-11 rounded-lg border border-border px-3 text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </label>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
        <p className="text-[15px] font-semibold text-text-primary">
          Learn from a past exam <span className="font-normal text-text-tertiary">(optional)</span>
        </p>
        <p className="mt-1 text-[14px] text-text-secondary">
          Upload or paste a past exam. The AI drafts the question types it sees — you review
          every draft below before saving. The exam is also kept on the format as generation
          material.
        </p>

        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={pastText}
            onChange={(e) => setPastText(e.target.value)}
            rows={3}
            placeholder="Paste a past exam here…"
            className="rounded-lg border border-border px-3 py-2 text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <div
            onClick={() => pastInputRef.current?.click()}
            className="cursor-pointer rounded-lg border-2 border-dashed border-border p-5 text-center text-[14px] text-text-secondary hover:border-border-strong"
          >
            <p>Drop PDF or image pages here, or click to browse. DOCX/TXT are read as text.</p>
            <input
              ref={pastInputRef}
              type="file"
              accept={ACCEPTED_UPLOAD_EXTENSIONS}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void addPastFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
          </div>
          {pastFileError && <p className="text-[14px] text-error">{pastFileError}</p>}

          {(storedFiles.length > 0 || extracted.length > 0) && (
            <ul className="divide-y divide-border">
              {storedFiles.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-[14px]">
                  <span className="break-words text-text-primary">{a.name}</span>
                  <button
                    type="button"
                    onClick={() => void removeStoredFile(a.id)}
                    className="shrink-0 text-text-secondary hover:text-error"
                  >
                    Remove
                  </button>
                </li>
              ))}
              {extracted.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 py-2 text-[14px]">
                  <span className="break-words text-text-primary">
                    {f.name} <span className="text-text-tertiary">(text extracted)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setExtracted((prev) => prev.filter((x) => x.id !== f.id))}
                    className="shrink-0 text-text-secondary hover:text-error"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void runInference()}
              disabled={inferState === "running"}
              className="rounded-lg bg-accent px-4 py-2 text-[15px] font-medium text-white enabled:hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {inferState === "running" ? "Reading exam…" : "Infer question types"}
            </button>
            {inferError && <span className="text-[14px] text-error">{inferError}</span>}
          </div>

          {unsupported.length > 0 && (
            <div className="flex flex-col gap-2">
              {unsupported.map((u, i) => (
                <p key={i} className="rounded-lg border border-warning bg-warning-subtle px-3 py-2 text-[14px] text-text-primary">
                  <span className="font-semibold">Not supported — {u.label}:</span> {u.reason}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {types.map((t, i) => (
        <div key={t.key} className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[15px] font-semibold text-text-primary">
              Type {i + 1}
              {t.label.trim() ? ` — ${t.label.trim()}` : ""}
            </p>
            <button
              type="button"
              onClick={() => setTypes((prev) => prev.filter((_, j) => j !== i))}
              className="shrink-0 text-[14px] font-medium text-error hover:underline"
            >
              Remove
            </button>
          </div>

          <label className="mt-3 flex flex-col gap-1.5">
            <span className="text-[14px] text-text-secondary">
              Label <span className="text-error">*</span>
            </span>
            <input
              type="text"
              value={t.label}
              onChange={(e) => patch(i, { label: e.target.value })}
              placeholder="e.g. Formula recall"
              className="h-11 rounded-lg border border-border px-3 text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[14px] text-text-secondary">Answer format</span>
              <select
                value={t.format}
                onChange={(e) => patch(i, { format: e.target.value as AnswerFormat })}
                className="h-11 rounded-lg border border-border bg-surface px-2 text-text-primary outline-none focus:border-accent"
              >
                {FORMAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} title={o.hint}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[14px] text-text-secondary">Shape</span>
              <select
                value={t.shape}
                onChange={(e) => patch(i, { shape: e.target.value as TypeShape })}
                className="h-11 rounded-lg border border-border bg-surface px-2 text-text-primary outline-none focus:border-accent"
              >
                {SHAPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} title={o.hint}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[14px] text-text-secondary">Stimulus</span>
              <select
                value={t.stimulus}
                onChange={(e) => patch(i, { stimulus: e.target.value as StimulusKind })}
                className="h-11 rounded-lg border border-border bg-surface px-2 text-text-primary outline-none focus:border-accent"
              >
                {STIMULUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-3 flex flex-col gap-1.5">
            <span className="text-[14px] text-text-secondary">
              Guidance <span className="text-text-tertiary">(plain words, compiled into the prompt)</span>
            </span>
            <textarea
              value={t.guidance}
              onChange={(e) => patch(i, { guidance: e.target.value })}
              rows={2}
              placeholder="e.g. Wrong options are neighboring formulas, not nonsense."
              className="rounded-lg border border-border px-3 py-2 text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>

          <div className="mt-3 flex flex-col gap-2">
            <span className="text-[14px] text-text-secondary">
              Past-exam examples <span className="text-text-tertiary">(optional, format reference only)</span>
            </span>
            {t.examples.map((ex, j) => (
              <div key={j} className="flex items-start gap-2">
                <textarea
                  value={ex}
                  onChange={(e) =>
                    patch(i, { examples: t.examples.map((v, k) => (k === j ? e.target.value : v)) })
                  }
                  rows={2}
                  placeholder="Paste one real past-exam question…"
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <button
                  type="button"
                  onClick={() => patch(i, { examples: t.examples.filter((_, k) => k !== j) })}
                  aria-label="Remove example"
                  className="mt-2 shrink-0 text-text-tertiary hover:text-error"
                >
                  ✕
                </button>
              </div>
            ))}
            {t.examples.length < MAX_EXAMPLES && (
              <button
                type="button"
                onClick={() => patch(i, { examples: [...t.examples, ""] })}
                className="self-start text-[14px] font-medium text-accent hover:underline"
              >
                + Add example
              </button>
            )}
          </div>

          <label className="mt-3 flex items-center gap-2">
            <span className="text-[14px] text-text-secondary">Default count</span>
            <input
              type="number"
              min={0}
              max={MAX_QUESTION_COUNT}
              value={t.countText}
              onChange={(e) => patch(i, { countText: e.target.value })}
              className="h-10 w-20 rounded-lg border border-border px-2 text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
        </div>
      ))}

      <div>
        <button
          type="button"
          onClick={() => setTypes((prev) => [...prev, blankDraft()])}
          className="flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong text-[15px] font-medium text-text-secondary hover:border-accent hover:text-accent"
        >
          + Add question type
        </button>
        <p className="mt-2 text-[14px] text-text-secondary">
          {totalDefault} question{totalDefault === 1 ? "" : "s"} by default.
        </p>
      </div>

      {error && <p className="text-[15px] text-error">{error}</p>}

      <div className="flex justify-end border-t border-border py-6">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-accent px-4 py-2.5 text-[15px] font-medium text-white hover:bg-accent-hover"
        >
          {saveLabel}
        </button>
      </div>

      {confirmReplace && (
        <ConfirmDialog
          title={`Replace ${types.length} existing type${types.length === 1 ? "" : "s"}?`}
          body={`This will replace the ${types.length} type${types.length === 1 ? "" : "s"} above with ${confirmReplace.length} inferred from the past exam. This can't be undone, but you can still edit every draft before saving.`}
          confirmLabel="Replace with inferred types"
          onConfirm={() => applyInferred(confirmReplace)}
          onCancel={() => setConfirmReplace(null)}
        />
      )}
    </div>
  );
}
