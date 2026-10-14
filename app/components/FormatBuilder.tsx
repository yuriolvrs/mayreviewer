"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import UploadIcon from "@/app/components/UploadIcon";
import { extractTextFromFile } from "@/app/lib/extractText";
import {
  ACCEPTED_UPLOAD_EXTENSIONS,
  HEIC_GUIDANCE,
  isHeicFile,
} from "@/app/lib/attachmentLimits";
import {
  MAX_DESCRIPTION_CHARS,
  MAX_EXAMPLES,
  MAX_EXAMPLE_CHARS,
  MAX_FORMAT_TYPES,
  MAX_GUIDANCE_CHARS,
  MAX_ID_CHARS,
  MAX_LABEL_CHARS,
  composePastExamText,
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
  deleteFormatAttachments,
  getFormatAttachments,
  removeFormatAttachment,
  type FormatAttachment,
} from "@/app/lib/attachments";
import { MAX_QUESTION_COUNT } from "@/app/lib/questions";
import { newId } from "@/app/lib/ids";
import { useOnline } from "@/app/lib/useOnline";
import { useUnsavedGuard } from "@/app/lib/useUnsavedGuard";
import { inferFormat } from "@/app/lib/inferFormatClient";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import OptionSelect from "@/app/components/OptionSelect";
import FormatPreview from "@/app/components/FormatPreview";

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
  // Removed types stay in the list for the session so "Undo" can bring them
  // back; they are skipped by validation, counts, and save.
  removed?: boolean;
};

// The one problem a card shows at a time, tied to a field by `field`
// ("label", "count", "guidance", "example-0", ...).
type TypeError = { field: string; message: string };
type Errors = {
  name?: string;
  description?: string;
  list?: string;
  types: Record<string, TypeError>;
};
const NO_ERRORS: Errors = { types: {} };

const FORMAT_OPTIONS: { value: AnswerFormat; label: string; hint: string }[] = [
  { value: "mc", label: "Multiple choice", hint: "4 options, one correct" },
  { value: "true-false", label: "True / False", hint: "2 options" },
  { value: "modified-tf", label: "Modified True/False", hint: "statements + combination options" },
  { value: "short-answer", label: "Short answer", hint: "1-3 sentences, graded by AI" },
];

const SHAPE_OPTIONS: { value: TypeShape; label: string; hint: string }[] = [
  { value: "standalone", label: "Single questions", hint: "Each question on its own" },
  { value: "set", label: "Problem set", hint: "Several questions share one problem" },
];

const STIMULUS_OPTIONS: { value: StimulusKind; label: string; hint: string }[] = [
  { value: "none", label: "None", hint: "No attached material" },
  { value: "prose", label: "Prose passage", hint: "A short passage to read" },
  { value: "table", label: "Table", hint: "Rows and columns to trace" },
  { value: "code", label: "Code listing", hint: "A program with blanks to fill" },
  { value: "formula", label: "Formula / worked stem", hint: "Math to solve and pick from" },
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

// Used only to decide "has anything changed since the form opened".
function signature(name: string, description: string, types: TypeDraft[], pastText: string): string {
  return JSON.stringify([name, description, pastText, types.filter((t) => !t.removed)]);
}

function typeDetail(t: TypeDraft): string {
  const parts: string[] = [];
  if (t.format !== "short-answer") {
    const layout = SHAPE_OPTIONS.find((o) => o.value === t.shape)?.label ?? t.shape;
    const material =
      t.stimulus === "none" ? "" : STIMULUS_OPTIONS.find((o) => o.value === t.stimulus)?.label ?? "";
    parts.push(material ? `${layout}, ${material}` : layout);
  }
  const n = parseInt(t.countText, 10);
  parts.push(Number.isInteger(n) ? `${n} by default` : "count missing");
  return parts.join(" · ");
}

function subscribeCoarse(cb: () => void) {
  const mq = window.matchMedia("(pointer: coarse)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export default function FormatBuilder({
  initial,
  formatId,
  saveLabel,
  isNew,
  onSave,
  onDiscard,
  showPreview = false,
}: {
  // Blank for new formats, a clone for copies, the stored custom for edits.
  // Keys arrive stable and stay stable — renames must never orphan counts.
  initial: ExamFormat;
  // The format's own id, used to key its past-exam file attachments in
  // IndexedDB. Stable for the page's lifetime (minted once by the parent).
  formatId: string;
  saveLabel: string;
  // True while the format is an unsaved draft (new or clone): its past-exam
  // files are deleted if the user leaves without saving.
  isNew: boolean;
  onSave: (format: ExamFormat) => void;
  onDiscard: () => void;
  // Shows a collapsible sample of the draft as it is being edited.
  showPreview?: boolean;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [types, setTypes] = useState<TypeDraft[]>(initial.types.map(toDraft));
  // Cards start collapsed to a summary; new, inferred, and invalid ones open.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Errors>(NO_ERRORS);
  const [focusReq, setFocusReq] = useState<{ id: string; n: number } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [showReinfer, setShowReinfer] = useState(false);

  // Past-exam state: files live in the format-attachments store under
  // formatId from the moment they're added (same immediate-save pattern as
  // reviewer PDFs); text is composed at save time into the format record.
  const [pastText, setPastText] = useState(initial.pastExam?.text ?? "");
  const [extracted, setExtracted] = useState<{ id: string; name: string; text: string }[]>([]);
  const [storedFiles, setStoredFiles] = useState<FormatAttachment[]>([]);
  const [filesTouched, setFilesTouched] = useState(false);
  const [pastFileError, setPastFileError] = useState("");
  const [inferState, setInferState] = useState<"idle" | "running" | "error">("idle");
  const [inferError, setInferError] = useState("");
  // Inference calls the model — offline, the button explains instead of failing.
  const online = useOnline();
  const [unsupported, setUnsupported] = useState<UnsupportedNote[]>([]);
  const [confirmReplace, setConfirmReplace] = useState<InferredType[] | null>(null);
  const pastInputRef = useRef<HTMLInputElement>(null);
  // Same upload/paste tabs as the reviewer content fields: one visible mode
  // at a time instead of a stacked textarea + dropzone. Defaults to paste
  // when an exam is already attached, upload otherwise.
  const [pastMode, setPastMode] = useState<"upload" | "paste">(
    initial.pastExam?.text ? "paste" : "upload",
  );
  const [dragOver, setDragOver] = useState(false);
  const coarsePointer = useSyncExternalStore(
    subscribeCoarse,
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );

  const [initialSig] = useState(() =>
    signature(
      initial.name,
      initial.description,
      initial.types.map(toDraft),
      initial.pastExam?.text ?? "",
    ),
  );
  const dirty = filesTouched || signature(name, description, types, pastText) !== initialSig;
  useUnsavedGuard(dirty);

  const saved = useRef(false);
  useEffect(() => {
    getFormatAttachments(formatId).then(setStoredFiles);
  }, [formatId]);

  // Files are stored the moment they're added, under an id that only exists
  // once the format is saved. Leaving a new draft unsaved would orphan them.
  useEffect(() => {
    return () => {
      if (isNew && !saved.current) void deleteFormatAttachments(formatId).catch(() => {});
    };
  }, [isNew, formatId]);

  useEffect(() => {
    if (!focusReq) return;
    const el = document.getElementById(focusReq.id);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.focus({ preventScroll: true });
  }, [focusReq]);

  const live = types.filter((t) => !t.removed);

  function pastExamText(): string {
    return composePastExamText([
      pastText,
      ...extracted.map((f) => `--- ${f.name} ---\n${f.text}`),
    ]);
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

    setFilesTouched(true);
    // Uploaded in parallel: a sequential await chain makes N files take N
    // round trips to Blob storage.
    const added = await Promise.all(native.map((file) => addFormatAttachment(formatId, file)));
    setStoredFiles((prev) => [...prev, ...added]);
    for (const file of textables) {
      try {
        const text = await extractTextFromFile(file);
        setExtracted((prev) => [...prev, { id: newId(), name: file.name, text }]);
      } catch {
        // A HEIC rejection above stays put — one unreadable text file must
        // not erase the more actionable message.
        setPastFileError((prev) => prev || `Couldn't read "${file.name}" as text.`);
      }
    }
  }

  async function removeStoredFile(id: string) {
    setFilesTouched(true);
    await removeFormatAttachment(id);
    setStoredFiles((prev) => prev.filter((a) => a.id !== id));
  }

  function draftFromInferred(t: InferredType): TypeDraft {
    const short = t.answerFormat === "short-answer";
    return {
      key: newTypeKey(t.label),
      label: t.label,
      format: t.answerFormat,
      shape: short ? "standalone" : t.shape,
      stimulus: short ? "none" : t.stimulusKind,
      guidance: t.guidance,
      examples: t.example ? [t.example] : [],
      countText: String(t.suggestedCount),
    };
  }

  function applyInferred(drafts: InferredType[]) {
    const next = drafts.map(draftFromInferred);
    setTypes(next);
    // Inferred drafts are machine guesses: open each so it gets reviewed.
    setOpen(Object.fromEntries(next.map((t) => [t.key, true])));
    setErrors(NO_ERRORS);
    setConfirmReplace(null);
  }

  async function runInference() {
    setInferState("running");
    setInferError("");
    setUnsupported([]);
    try {
      const data = await inferFormat({
        files: storedFiles,
        text: pastExamText(),
        // The format name gives the analyst subject context ("midterm for
        // Math 101" beats "the course").
        subject: name.trim(),
        uploadPrefix: `past-exam/${formatId}`,
      });
      setUnsupported(data.unsupported ?? []);
      const drafts = data.types ?? [];
      if (drafts.length === 0) {
        setInferError(
          data.unsupported && data.unsupported.length > 0
            ? "No supported formats found. See the flagged entries below."
            : "No question formats recognized in that material.",
        );
      } else if (live.length > 0) {
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
    // A short answer has no set to share and no material slot, so choosing it
    // pins both — the saved format would be rejected otherwise.
    const next: Partial<TypeDraft> =
      change.format === "short-answer" ? { ...change, shape: "standalone", stimulus: "none" } : change;
    const key = types[index].key;
    setTypes((prev) => prev.map((t, i) => (i === index ? { ...t, ...next } : t)));
    // Editing a card is the fix for its problem: drop the stale message.
    if (errors.types[key]) {
      setErrors((prev) => {
        const rest = { ...prev.types };
        delete rest[key];
        return { ...prev, types: rest };
      });
    }
  }

  function addType() {
    const draft = blankDraft();
    setTypes((prev) => [...prev, draft]);
    setOpen((prev) => ({ ...prev, [draft.key]: true }));
    setErrors((prev) => ({ ...prev, list: undefined }));
  }

  // Swaps with the neighbouring live type, skipping removed placeholders.
  function moveType(key: string, delta: -1 | 1) {
    setTypes((prev) => {
      const from = prev.findIndex((t) => t.key === key);
      let to = from + delta;
      while (to >= 0 && to < prev.length && prev[to].removed) to += delta;
      if (from < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }

  function setRemoved(key: string, removed: boolean) {
    setTypes((prev) => prev.map((t) => (t.key === key ? { ...t, removed } : t)));
    if (removed) {
      setErrors((prev) => {
        const rest = { ...prev.types };
        delete rest[key];
        return { ...prev, types: rest };
      });
    } else {
      setOpen((prev) => ({ ...prev, [key]: true }));
    }
  }

  function validate(): { errs: Errors; firstFocus: string | null; openKeys: string[] } {
    const errs: Errors = { types: {} };
    let firstFocus: string | null = null;
    const focusOn = (id: string) => {
      if (!firstFocus) firstFocus = id;
    };
    if (!name.trim()) {
      errs.name = "Give the format a name.";
      focusOn("fmt-name");
    } else if (name.trim().length > MAX_ID_CHARS) {
      errs.name = `Name must be ${MAX_ID_CHARS} characters or less.`;
      focusOn("fmt-name");
    }
    if (description.trim().length > MAX_DESCRIPTION_CHARS) {
      errs.description = `Description must be ${MAX_DESCRIPTION_CHARS} characters or less.`;
      focusOn("fmt-description");
    }
    if (live.length === 0) {
      errs.list = "Add at least one question type.";
      focusOn("fmt-add-type");
    } else if (live.length > MAX_FORMAT_TYPES) {
      errs.list = `At most ${MAX_FORMAT_TYPES} types per format.`;
      focusOn("fmt-add-type");
    }
    const openKeys: string[] = [];
    for (const t of live) {
      let err: TypeError | null = null;
      const n = parseInt(t.countText, 10);
      if (!t.label.trim()) err = { field: "label", message: "Every type needs a label." };
      else if (t.label.trim().length > MAX_LABEL_CHARS)
        err = { field: "label", message: `Label must be ${MAX_LABEL_CHARS} characters or less.` };
      else if (!Number.isInteger(n) || n < 0 || n > MAX_QUESTION_COUNT)
        err = { field: "count", message: `Count must be 0–${MAX_QUESTION_COUNT}.` };
      else if (t.guidance.trim().length > MAX_GUIDANCE_CHARS)
        err = { field: "guidance", message: `Tips must be ${MAX_GUIDANCE_CHARS} characters or less.` };
      else if (t.examples.length > MAX_EXAMPLES)
        err = { field: "examples", message: `At most ${MAX_EXAMPLES} examples.` };
      else {
        const j = t.examples.findIndex((e) => e.trim().length > MAX_EXAMPLE_CHARS);
        if (j >= 0)
          err = { field: `example-${j}`, message: `Each example must be ${MAX_EXAMPLE_CHARS} characters or less.` };
      }
      if (err) {
        errs.types[t.key] = err;
        openKeys.push(t.key);
        focusOn(`${t.key}-${err.field}`);
      }
    }
    return { errs, firstFocus, openKeys };
  }

  function handleSave() {
    const { errs, firstFocus, openKeys } = validate();
    setErrors(errs);
    if (firstFocus) {
      if (openKeys.length > 0) setOpen((prev) => ({ ...prev, ...Object.fromEntries(openKeys.map((k) => [k, true])) }));
      setFocusReq((prev) => ({ id: firstFocus as string, n: (prev?.n ?? 0) + 1 }));
      return;
    }
    const pastText = pastExamText();
    saved.current = true;
    onSave({
      id: initial.id,
      name: name.trim(),
      description: description.trim(),
      ...(pastText
        ? {
            pastExam: {
              fileName: storedFiles[0]?.name ?? extracted[0]?.name ?? "past exam text",
              text: pastText,
              addedAt: new Date().toISOString(),
            },
          }
        : {}),
      types: live.map((t) => ({
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

  const totalDefault = live.reduce((sum, t) => {
    const n = parseInt(t.countText, 10);
    return sum + (Number.isInteger(n) && n > 0 ? n : 0);
  }, 0);

  const errorCount =
    Object.keys(errors.types).length +
    (errors.name ? 1 : 0) +
    (errors.description ? 1 : 0) +
    (errors.list ? 1 : 0);

  const inferBlocked = !online
    ? "Reading material needs an internet connection."
    : pastExamText().trim() === "" && storedFiles.length === 0
      ? "Paste or upload a past exam or course material first."
      : "";

  const fieldClass = (bad: boolean) =>
    `rounded-lg border px-3 text-text-primary outline-none focus:border-accent ${
      bad ? "border-error" : "border-border"
    }`;

  const pastExamCard = (
    <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <p className="text-[0.9375rem] font-semibold text-text-primary">
        Learn from a past exam or course material <span className="font-normal text-text-tertiary">(optional)</span>
      </p>
      <p className="mt-1 text-[0.875rem] text-text-secondary">
        Upload or paste a past exam, notes, or slides. The AI suggests question types from
        it, and you review each one before saving. The material stays attached to the format for later.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        <div className="flex gap-4 border-b border-border" role="tablist" aria-label="Material input mode">
          {(["upload", "paste"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={pastMode === mode}
              onClick={() => setPastMode(mode)}
              className={`-mb-px min-h-11 border-b-2 py-2 text-[0.9375rem] font-medium ${
                pastMode === mode
                  ? "border-accent text-text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {mode === "upload" ? "Upload files" : "Paste text"}
            </button>
          ))}
        </div>

        {pastMode === "paste" ? (
          <textarea
            value={pastText}
            onChange={(e) => setPastText(e.target.value)}
            rows={3}
            placeholder="Paste a past exam or course material here…"
            aria-label="Paste a past exam or course material"
            className="rounded-lg border border-border px-3 py-2 text-text-primary outline-none focus:border-accent"
          />
        ) : (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files) void addPastFiles(Array.from(e.dataTransfer.files));
              }}
              onClick={() => pastInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-5 text-center text-[0.875rem] text-text-secondary hover:border-border-strong ${
                dragOver ? "border-accent bg-accent-subtle" : "border-border"
              }`}
            >
              <UploadIcon size={24} />
              <p>
                {coarsePointer
                  ? "Drop files here or tap to choose. PDF or image pages; DOCX/TXT are read as text."
                  : "Drop PDF or image pages here, or click to browse. DOCX/TXT are read as text."}
              </p>
              {/* Visually hidden but focusable: keyboard users get a native
                  file input, not a div pretending to be one. */}
              <input
                ref={pastInputRef}
                type="file"
                accept={ACCEPTED_UPLOAD_EXTENSIONS}
                multiple
                aria-label="Upload past exam or course material files"
                className="sr-only"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  if (e.target.files) void addPastFiles(Array.from(e.target.files));
                  e.target.value = "";
                }}
              />
            </div>
            {pastFileError && <p className="text-[0.875rem] text-error">{pastFileError}</p>}

            {(storedFiles.length > 0 || extracted.length > 0) && (
              <ul className="divide-y divide-border">
                {storedFiles.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-1 text-[0.875rem]">
                    <span className="break-words text-text-primary">{a.name}</span>
                    <button
                      type="button"
                      onClick={() => void removeStoredFile(a.id)}
                      aria-label={`Remove ${a.name}`}
                      className="min-h-11 shrink-0 px-2 text-text-secondary hover:text-error"
                    >
                      Remove
                    </button>
                  </li>
                ))}
                {extracted.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 py-1 text-[0.875rem]">
                    <span className="break-words text-text-primary">
                      {f.name} <span className="text-text-tertiary">(text extracted)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setFilesTouched(true);
                        setExtracted((prev) => prev.filter((x) => x.id !== f.id));
                      }}
                      aria-label={`Remove ${f.name}`}
                      className="min-h-11 shrink-0 px-2 text-text-secondary hover:text-error"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <div className="mt-2 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => void runInference()}
            disabled={inferState === "running" || !!inferBlocked}
            className="min-h-11 rounded-lg border border-accent bg-surface px-4 py-2 text-[0.9375rem] font-medium text-accent enabled:hover:bg-accent-subtle disabled:cursor-not-allowed disabled:opacity-40"
          >
            {inferState === "running" ? "Reading material…" : "Read the material and suggest types"}
          </button>
          {inferBlocked && inferState !== "running" && (
            <p className="text-[0.875rem] text-text-secondary">{inferBlocked}</p>
          )}
          {inferError && (
            <span role="alert" className="text-[0.875rem] text-error">
              {inferError}
            </span>
          )}
        </div>

        {unsupported.length > 0 && (
          <div className="flex flex-col gap-2">
            {unsupported.map((u, i) => (
              <p key={i} className="rounded-lg border border-warning bg-warning-subtle px-3 py-2 text-[0.875rem] text-text-primary">
                <span className="font-semibold">Not supported: {u.label}.</span> {u.reason}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const pastExamFirst = isNew && initial.types.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="fmt-name" className="text-[0.875rem] text-text-secondary">
            Format name <span className="text-error">*</span>
          </label>
          <input
            id="fmt-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
            }}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "fmt-name-error" : undefined}
            placeholder="e.g. Math 101, my prof's format"
            className={`h-11 ${fieldClass(!!errors.name)}`}
          />
          {errors.name && (
            <p id="fmt-name-error" className="text-[0.875rem] text-error">
              {errors.name}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="fmt-description" className="text-[0.875rem] text-text-secondary">
            Description (optional)
          </label>
          <input
            id="fmt-description"
            type="text"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              if (errors.description) setErrors((p) => ({ ...p, description: undefined }));
            }}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={errors.description ? "fmt-description-error" : undefined}
            placeholder="What exam is this for?"
            className={`h-11 ${fieldClass(!!errors.description)}`}
          />
          {errors.description && (
            <p id="fmt-description-error" className="text-[0.875rem] text-error">
              {errors.description}
            </p>
          )}
        </div>
      </div>

      {pastExamFirst && pastExamCard}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div>
            <h2 className="text-[0.9375rem] font-semibold text-text-primary">Question types</h2>
            <p className="text-[0.875rem] text-text-secondary">
              {live.length} type{live.length === 1 ? "" : "s"} · {totalDefault} question
              {totalDefault === 1 ? "" : "s"} by default
            </p>
          </div>
          <div className="flex items-center gap-1">
            {!pastExamFirst && (
              <button
                type="button"
                aria-expanded={showReinfer}
                aria-controls="fmt-reinfer"
                onClick={() => setShowReinfer((v) => !v)}
                className="min-h-11 rounded-lg px-3 text-[0.875rem] font-medium text-accent hover:bg-accent-subtle"
              >
                Re-infer from material
              </button>
            )}
            <button
              type="button"
              onClick={addType}
              disabled={live.length >= MAX_FORMAT_TYPES}
              className="min-h-11 rounded-lg px-3 text-[0.875rem] font-medium text-accent enabled:hover:bg-accent-subtle disabled:cursor-not-allowed disabled:opacity-40"
            >
              + Add type
            </button>
          </div>
        </div>
        {!pastExamFirst && showReinfer && <div id="fmt-reinfer">{pastExamCard}</div>}
      </div>

      {types.map((t, i) => {
        if (t.removed) {
          return (
            <div
              key={t.key}
              className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-dashed border-border px-4 py-1 text-[0.9375rem] text-text-secondary"
            >
              <span className="min-w-0 break-words">
                Type removed{t.label.trim() ? `: ${t.label.trim()}` : ""} ·
              </span>
              <button
                type="button"
                onClick={() => setRemoved(t.key, false)}
                className="min-h-11 shrink-0 px-2 font-medium text-accent hover:underline"
              >
                Undo
              </button>
            </div>
          );
        }
        const number = live.indexOf(t) + 1;
        const isOpen = !!open[t.key];
        const err = errors.types[t.key];
        const bodyId = `type-${t.key}-body`;
        const errFor = (field: string) => (err?.field === field ? err.message : "");
        const bad = (field: string) => !!errFor(field);
        const describe = (field: string) => (bad(field) ? `${t.key}-${field}-error` : undefined);
        const message = (field: string) =>
          bad(field) && (
            <p id={`${t.key}-${field}-error`} className="text-[0.875rem] text-error">
              {errFor(field)}
            </p>
          );
        return (
          <div
            key={t.key}
            id={`type-${t.key}`}
            className={`rounded-lg border bg-surface p-4 sm:p-5 ${err ? "border-error" : "border-border"}`}
          >
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={bodyId}
                onClick={() => setOpen((prev) => ({ ...prev, [t.key]: !isOpen }))}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span aria-hidden="true" className="shrink-0 font-mono text-[0.875rem] text-text-secondary">
                  {number}.
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="break-words text-[0.9375rem] font-semibold text-text-primary">
                      {t.label.trim() || "Untitled type"}
                    </span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-[0.75rem] text-text-secondary">
                      {FORMAT_OPTIONS.find((o) => o.value === t.format)?.label ?? t.format}
                    </span>
                  </span>
                  <span className="block break-words text-[0.875rem] text-text-secondary">{typeDetail(t)}</span>
                </span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 10 10"
                  fill="none"
                  aria-hidden="true"
                  className={`shrink-0 text-text-secondary ${isOpen ? "rotate-180" : ""}`}
                >
                  <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div className="flex shrink-0 items-center">
                {(["up", "down"] as const).map((dir) => {
                  const label = t.label.trim() || `type ${number}`;
                  const atEnd = dir === "up" ? number === 1 : number === live.length;
                  return (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => moveType(t.key, dir === "up" ? -1 : 1)}
                      disabled={atEnd}
                      aria-label={`Move ${label} ${dir}`}
                      className="flex min-h-11 min-w-11 items-center justify-center text-text-secondary enabled:hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 10 10"
                        fill="none"
                        aria-hidden="true"
                        className={dir === "up" ? "rotate-180" : ""}
                      >
                        <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setRemoved(t.key, true)}
                  aria-label={`Remove ${t.label.trim() || `type ${number}`}`}
                  className="min-h-11 px-2 text-[0.875rem] font-medium text-text-secondary hover:text-error"
                >
                  Remove
                </button>
              </div>
            </div>

            {err && !isOpen && (
              <p className="mt-1 text-[0.875rem] text-error">{err.message}</p>
            )}

            {isOpen && (
              <div id={bodyId} className="mt-3 border-t border-border pt-4">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <label htmlFor={`${t.key}-label`} className="text-[0.875rem] text-text-secondary">
                      Label <span className="text-error">*</span>
                    </label>
                    <input
                      id={`${t.key}-label`}
                      type="text"
                      value={t.label}
                      onChange={(e) => patch(i, { label: e.target.value })}
                      aria-invalid={bad("label") ? true : undefined}
                      aria-describedby={describe("label")}
                      placeholder="e.g. Formula recall"
                      className={`h-11 ${fieldClass(bad("label"))}`}
                    />
                    {message("label")}
                  </div>
                  <div className="flex flex-col gap-1.5 sm:w-28">
                    <label htmlFor={`${t.key}-count`} className="text-[0.875rem] text-text-secondary">
                      Default count
                    </label>
                    <input
                      id={`${t.key}-count`}
                      type="number"
                      min={0}
                      max={MAX_QUESTION_COUNT}
                      value={t.countText}
                      onChange={(e) => patch(i, { countText: e.target.value })}
                      aria-invalid={bad("count") ? true : undefined}
                      aria-describedby={describe("count")}
                      className={`h-11 ${fieldClass(bad("count"))}`}
                    />
                    {message("count")}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[0.875rem] text-text-secondary">Answer format</span>
                    <OptionSelect
                      label="Answer format"
                      options={FORMAT_OPTIONS}
                      value={t.format}
                      onChange={(v) => patch(i, { format: v as AnswerFormat })}
                    />
                    <span className="text-[0.8125rem] text-text-secondary">
                      {FORMAT_OPTIONS.find((o) => o.value === t.format)?.hint}
                    </span>
                  </label>
                  {t.format === "short-answer" ? (
                    <p className="text-[0.875rem] leading-relaxed text-text-secondary sm:col-span-2">
                      Each question is answered in one to three typed sentences and graded by AI against
                      key points when the quiz is submitted. Short answers are always single questions
                      with no attached material.
                    </p>
                  ) : (
                    <>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[0.875rem] text-text-secondary">Layout</span>
                        <OptionSelect
                          label="Layout"
                          options={SHAPE_OPTIONS}
                          value={t.shape}
                          onChange={(v) => patch(i, { shape: v as TypeShape })}
                        />
                        <span className="text-[0.8125rem] text-text-secondary">
                          Single questions stand alone. A problem set shares one scenario.
                        </span>
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[0.875rem] text-text-secondary">Material</span>
                        <OptionSelect
                          label="Material"
                          options={STIMULUS_OPTIONS}
                          value={t.stimulus}
                          onChange={(v) => patch(i, { stimulus: v as StimulusKind })}
                        />
                        <span className="text-[0.8125rem] text-text-secondary">
                          What students read before answering: a passage, table, code, or formula.
                        </span>
                      </label>
                    </>
                  )}
                </div>

                <div className="mt-3 flex flex-col gap-1.5">
                  <label htmlFor={`${t.key}-guidance`} className="text-[0.875rem] text-text-secondary">
                    Tips for the question writer <span className="text-text-tertiary">(optional)</span>
                  </label>
                  <textarea
                    id={`${t.key}-guidance`}
                    value={t.guidance}
                    onChange={(e) => patch(i, { guidance: e.target.value })}
                    aria-invalid={bad("guidance") ? true : undefined}
                    aria-describedby={describe("guidance")}
                    rows={2}
                    placeholder="e.g. Ask for causes, not dates, use neighboring formulas for wrong options, keep tables to two or three rows."
                    className={`py-2 ${fieldClass(bad("guidance"))}`}
                  />
                  {message("guidance")}
                </div>

                <div className="mt-3 flex flex-col gap-2">
                  <span className="text-[0.875rem] text-text-secondary">
                    Past-exam examples <span className="text-text-tertiary">(optional)</span>
                  </span>
                  <span className="text-[0.8125rem] text-text-secondary">
                    Used only to copy the style; never shown in quizzes.
                  </span>
                  {message("examples")}
                  {t.examples.map((ex, j) => (
                    <div key={j} className="flex flex-col gap-1.5">
                      <div className="flex items-start gap-2">
                        <textarea
                          id={`${t.key}-example-${j}`}
                          value={ex}
                          onChange={(e) =>
                            patch(i, { examples: t.examples.map((v, k) => (k === j ? e.target.value : v)) })
                          }
                          aria-label={`Example ${j + 1}`}
                          aria-invalid={bad(`example-${j}`) ? true : undefined}
                          aria-describedby={describe(`example-${j}`)}
                          rows={2}
                          placeholder="Paste one real past-exam question…"
                          className={`flex-1 py-2 ${fieldClass(bad(`example-${j}`))}`}
                        />
                        <button
                          type="button"
                          onClick={() => patch(i, { examples: t.examples.filter((_, k) => k !== j) })}
                          aria-label={`Remove example ${j + 1} from ${t.label.trim() || `type ${number}`}`}
                          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-text-tertiary hover:text-error"
                        >
                          <svg width="14" height="14" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                            <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                      {message(`example-${j}`)}
                    </div>
                  ))}
                  {t.examples.length < MAX_EXAMPLES && (
                    <button
                      type="button"
                      onClick={() => patch(i, { examples: [...t.examples, ""] })}
                      className="inline-flex min-h-11 items-center self-start text-[0.875rem] font-medium text-accent hover:underline"
                    >
                      + Add example
                    </button>
                  )}
                </div>

              </div>
            )}
          </div>
        );
      })}

      <div>
        <button
          id="fmt-add-type"
          type="button"
          onClick={addType}
          disabled={live.length >= MAX_FORMAT_TYPES}
          aria-describedby={errors.list ? "fmt-list-error" : undefined}
          className="flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong text-[0.9375rem] font-medium text-text-secondary enabled:hover:border-accent enabled:hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Add question type
        </button>
        {live.length >= MAX_FORMAT_TYPES && (
          <p className="mt-2 text-[0.875rem] text-text-secondary">
            At most {MAX_FORMAT_TYPES} types per format.
          </p>
        )}
        {errors.list && (
          <p id="fmt-list-error" className="mt-2 text-[0.875rem] text-error">
            {errors.list}
          </p>
        )}
      </div>

      {showPreview && live.length > 0 && (
        <details className="group rounded-lg border border-border bg-surface">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-[0.9375rem] font-medium text-text-primary hover:bg-surface-alt [&::-webkit-details-marker]:hidden">
            Preview
            <svg width="14" height="14" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="shrink-0 text-text-secondary transition-transform group-open:rotate-180">
              <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="px-4 pb-4">
            <p className="mb-3 text-[0.875rem] text-text-secondary">
              Updates as you edit, with placeholder questions.
            </p>
            <FormatPreview
              format={{
                id: initial.id,
                name: name.trim(),
                description: description.trim(),
                types: live.map((t) => ({
                  key: t.key,
                  label: t.label.trim() || "Untitled type",
                  format: t.format,
                  shape: t.shape,
                  stimulus: t.stimulus,
                  guidance: t.guidance.trim(),
                  examples: [],
                  defaultCount: parseInt(t.countText, 10) || 0,
                })),
              }}
            />
          </div>
        </details>
      )}

      {/* Spacer so the fixed bar never hides the last card. */}
      <div aria-hidden="true" className="h-20" />

      {/* Fixed, same offset as the Details tab bar: above the mobile bottom
          bar, flush to the bottom from md up. */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t border-border bg-bg md:bottom-0">
        <div className="mx-auto w-full max-w-3xl px-6 pt-3 pb-3 md:pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-menu">
            <span
              role={errorCount > 0 ? "alert" : undefined}
              className={`min-w-0 text-[0.875rem] ${errorCount > 0 ? "text-error" : "text-text-secondary"}`}
            >
              {errorCount > 0
                ? `Fix ${errorCount} problem${errorCount === 1 ? "" : "s"}`
                : dirty
                  ? "Unsaved changes"
                  : ""}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => (dirty ? setConfirmDiscard(true) : onDiscard())}
                className="min-h-11 rounded-lg px-4 py-2.5 text-[0.9375rem] font-medium text-text-secondary hover:bg-surface-alt hover:text-text-primary"
              >
                {dirty ? "Discard" : "Back"}
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="min-h-11 rounded-lg bg-accent px-4 py-2.5 text-[0.9375rem] font-medium text-on-accent hover:bg-accent-hover"
              >
                {saveLabel}
              </button>
            </div>
          </div>
        </div>
      </div>

      {confirmReplace && (
        <ConfirmDialog
          title={`Replace ${live.length} existing type${live.length === 1 ? "" : "s"}?`}
          body={`This will replace the ${live.length} type${live.length === 1 ? "" : "s"} above with ${confirmReplace.length} inferred from the material. This can't be undone, but you can still edit every draft before saving.`}
          confirmLabel="Replace with inferred types"
          onConfirm={() => applyInferred(confirmReplace)}
          onCancel={() => setConfirmReplace(null)}
        />
      )}
      {confirmDiscard && (
        <ConfirmDialog
          title="Discard your changes?"
          body={
            isNew
              ? "This format has not been saved. Leaving now throws it away, along with any past-exam files you added."
              : "Your edits to this format will be lost."
          }
          confirmLabel="Discard changes"
          destructive
          onConfirm={() => {
            setConfirmDiscard(false);
            onDiscard();
          }}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}
    </div>
  );
}
