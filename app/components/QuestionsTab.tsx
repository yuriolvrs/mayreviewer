"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { useRouter, useSearchParams } from "next/navigation";
import { updateReviewer } from "@/app/lib/storage";
import {
  MAX_KEY_POINTS,
  MAX_KEY_POINT_CHARS,
  MAX_MODEL_ANSWER_CHARS,
  QUESTION_SOURCES,
  SOURCE_LABELS,
  isPreformatted,
  isShortAnswer,
  optionLetter,
} from "@/app/lib/questions";
import {
  isMonoKind,
  resolveFromList,
  formatTypeKeys,
  stimulusKindOf,
  typeDefOf,
  typeLabelOf,
  type ExamFormat,
} from "@/app/lib/examFormats";
import { useFormats } from "@/app/lib/useFormats";
import {
  generateQuestions,
  type GenerationFailure,
  type GenerationProgress,
  type VerificationSummary,
} from "@/app/lib/generate";
import { newId } from "@/app/lib/ids";
import { useOnline } from "@/app/lib/useOnline";
import GenerationModal from "@/app/components/GenerationModal";
import StimulusQuote from "@/app/components/StimulusQuote";
import type { Question, QuestionSource, Reviewer } from "@/app/types";

const SOURCE_FILTERS: ("all" | QuestionSource)[] = ["all", ...QUESTION_SOURCES];

type Sort = "newest" | "oldest" | "type" | "number";

// Sentinel id for the not-yet-saved question, so the create card can reuse the
// exact same draft state and editor as an existing question being edited.
const NEW_ID = "__new__";

function blankQuestion(defaultType: string, short = false): Question {
  const answer = short
    ? { options: [], correctIndex: -1, answerKind: "short" as const, modelAnswer: "", keyPoints: [""] }
    : { options: ["", ""], correctIndex: 0 };
  return {
    id: NEW_ID,
    type: defaultType,
    question: "",
    ...answer,
    source: "manual",
    explanation: "",
    whyOthersWrong: "",
  };
}

// Switching a draft between a choice type and a short-answer type changes
// what it stores, so the answer fields are swapped rather than carried over.
// A question inside a set keeps its kind: its siblings share one problem.
function retype(draft: Question, type: string, short: boolean): Question {
  if (draft.groupId || short === isShortAnswer(draft)) return { ...draft, type };
  if (short) {
    return {
      ...draft,
      type,
      options: [],
      correctIndex: -1,
      answerKind: "short",
      modelAnswer: "",
      keyPoints: [""],
    };
  }
  const { answerKind: _kind, modelAnswer: _answer, keyPoints: _points, ...rest } = draft;
  void _kind;
  void _answer;
  void _points;
  return { ...rest, type, options: ["", ""], correctIndex: 0 };
}

function matchesSearch(question: Question, term: string): boolean {
  if (!term) return true;
  return (
    question.question.toLowerCase().includes(term) ||
    question.options.some((o) => o.toLowerCase().includes(term)) ||
    (question.modelAnswer ?? "").toLowerCase().includes(term) ||
    (question.keyPoints ?? []).some((p) => p.toLowerCase().includes(term))
  );
}

// Sized once on mount so the box opens fitting its question (~2 lines for a
// short one) instead of a fixed tall default. Deliberately not re-run on every
// keystroke: the drag handle stays authoritative once the user resizes.
const MIN_QUESTION_PX = 64;
const MAX_QUESTION_PX = 260;

function autoSizeQuestion(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(Math.max(el.scrollHeight, MIN_QUESTION_PX), MAX_QUESTION_PX)}px`;
}

function CaretIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      className={`pointer-events-none shrink-0 ${className}`}
    >
      <path
        d="M2 4l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M7 1.5 8.3 5.1 11.9 6.4 8.3 7.7 7 11.3 5.7 7.7 2.1 6.4 5.7 5.1z"
        fill="currentColor"
      />
      <path d="M11.2 9.6 11.8 11.2 13.4 11.8 11.8 12.4 11.2 14 10.6 12.4 9 11.8 10.6 11.2z" fill="currentColor" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2.5 7.5 5.5 10.5 11.5 3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M7 1.5 8.3 5.1 11.9 6.4 8.3 7.7 7 11.3 5.7 7.7 2.1 6.4 5.7 5.1z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function QuestionEditor({
  draft,
  setDraft,
  number,
  types,
  format,
  onSave,
  onCancel,
}: {
  draft: Question;
  setDraft: (q: Question) => void;
  number: number | undefined;
  // The reviewer's format decides which types the dropdown offers.
  types: string[];
  format: ExamFormat;
  onSave: () => void;
  onCancel: () => void;
}) {
  // A brand-new question starts with no answer picked at all — `correctIndex`
  // defaults to 0 for the data model's sake, but nothing is shown as correct
  // until the user actually selects a radio on an option that has text.
  const [picked, setPicked] = useState(draft.id !== NEW_ID);
  const isCorrect = (i: number) =>
    picked && draft.correctIndex === i && draft.options[i].trim() !== "";

  const isShort = isShortAnswer(draft);
  const keyPoints = draft.keyPoints ?? [];
  const keyPointsFilled = keyPoints.filter((p) => p.trim()).length;
  const filled = draft.options.filter((o) => o.trim()).length;
  const answerChosen = draft.options.some((_, i) => isCorrect(i));
  const canSave = isShort
    ? draft.question.trim() !== "" && (draft.modelAnswer ?? "").trim() !== "" && keyPointsFilled >= 1
    : draft.question.trim() !== "" && filled >= 2 && answerChosen;

  function saveHint(): string | undefined {
    if (draft.question.trim() === "") return "Add question text first";
    if (isShort) {
      if ((draft.modelAnswer ?? "").trim() === "") return "Write a model answer";
      if (keyPointsFilled < 1) return "Add at least one key point";
      return undefined;
    }
    if (filled < 2) return "Fill in at least two options";
    if (!answerChosen) return "Select the radio next to the correct option";
    return undefined;
  }

  function removeOption(index: number) {
    const options = draft.options.filter((_, j) => j !== index);
    // Keep the correct answer pointing at the same option it did before.
    let correctIndex = draft.correctIndex;
    if (index < correctIndex) correctIndex -= 1;
    else if (index === correctIndex) correctIndex = 0;
    setDraft({ ...draft, options, correctIndex });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[0.8125rem] tracking-wide">
            <span className="text-[0.875rem] font-bold text-text-primary">
              {number !== undefined ? `${number}.` : "New"}
            </span>{" "}
            <span className="text-text-tertiary uppercase">· Type:</span>
          </span>
          <span className="relative inline-flex shrink-0 items-center rounded px-1 text-text-secondary hover:bg-surface-alt">
            <select
              value={draft.type}
              onChange={(e) =>
                setDraft(
                  retype(draft, e.target.value, typeDefOf(format, e.target.value)?.format === "short-answer"),
                )
              }
              aria-label="Question type"
              className="cursor-pointer appearance-none border-0 bg-transparent p-0 pr-4 font-mono text-[0.8125rem] tracking-wide text-inherit uppercase outline-none hover:underline focus:underline"
            >
              {types.map((t) => (
                <option key={t} value={t} className="normal-case">
                  {typeLabelOf(format, t)}
                </option>
              ))}
            </select>
            <CaretIcon className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2" />
          </span>
          <span className="font-mono text-[0.8125rem] tracking-wide text-text-tertiary uppercase">
            · Source: {SOURCE_LABELS[draft.source]}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-3 text-[0.875rem]">
          <button
            onClick={onCancel}
            className="font-medium text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!canSave}
            title={saveHint()}
            className="rounded-lg bg-accent px-3 py-1.5 font-medium text-on-accent enabled:hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>

      {draft.stimulus !== undefined && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.875rem] text-text-secondary">
            Problem shared by this set. Editing it updates every question in the set
          </span>
          <textarea
            value={draft.stimulus}
            onChange={(e) => setDraft({ ...draft, stimulus: e.target.value })}
            rows={10}
            className="w-full rounded-lg border border-border bg-surface p-3 font-mono text-[0.875rem] text-text-primary outline-none focus:border-accent"
          />
        </label>
      )}

      <textarea
        ref={autoSizeQuestion}
        value={draft.question}
        onChange={(e) => setDraft({ ...draft, question: e.target.value })}
        rows={2}
        placeholder="Type your question…"
        aria-label="Question text"
        className={`w-full resize-y rounded-lg border border-border bg-surface p-3 text-[0.9375rem] text-text-primary outline-none focus:border-accent ${
          isPreformatted(draft.type) ? "font-mono" : ""
        }`}
      />

      {isShort ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[0.875rem] text-text-secondary">
              Model answer: one to three sentences a good answer would say
            </span>
            <textarea
              value={draft.modelAnswer ?? ""}
              onChange={(e) => setDraft({ ...draft, modelAnswer: e.target.value })}
              rows={3}
              maxLength={MAX_MODEL_ANSWER_CHARS}
              aria-label="Model answer"
              className="w-full resize-y rounded-lg border border-border bg-surface p-3 text-[0.9375rem] text-text-primary outline-none focus:border-accent"
            />
          </label>
          <div className="flex flex-col gap-2">
            <span className="text-[0.875rem] text-text-secondary">
              Key points: what an answer must contain. Credit is the share of these it covers.
            </span>
            {keyPoints.map((point, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-right font-mono text-[0.8125rem] text-text-tertiary">
                  {i + 1}.
                </span>
                <input
                  type="text"
                  value={point}
                  maxLength={MAX_KEY_POINT_CHARS}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      keyPoints: keyPoints.map((p, j) => (j === i ? e.target.value : p)),
                    })
                  }
                  placeholder={`Key point ${i + 1}`}
                  aria-label={`Key point ${i + 1}`}
                  className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-[0.9375rem] text-text-primary outline-none focus:border-accent"
                />
                {keyPoints.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, keyPoints: keyPoints.filter((_, j) => j !== i) })}
                    title="Remove key point"
                    aria-label={`Remove key point ${i + 1}`}
                    className="shrink-0 text-text-tertiary hover:text-error"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {keyPoints.length < MAX_KEY_POINTS && (
              <button
                type="button"
                onClick={() => setDraft({ ...draft, keyPoints: [...keyPoints, ""] })}
                className="self-start rounded-lg border border-dashed border-border-strong px-3 py-1.5 text-[0.875rem] font-medium text-text-secondary hover:border-accent hover:text-accent"
              >
                + Add key point
              </button>
            )}
          </div>
        </div>
      ) : (
      <>
      <div className="flex flex-col gap-2">
        {draft.options.map((option, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${
              isCorrect(i) ? "bg-success-subtle" : ""
            }`}
          >
            <input
              type="radio"
              name={`correct-${draft.id}`}
              checked={isCorrect(i)}
              onChange={() => {
                setPicked(true);
                setDraft({ ...draft, correctIndex: i });
              }}
              className="accent-success"
              aria-label={`Mark option ${optionLetter(i)} correct`}
            />
            <input
              type="text"
              value={option}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  options: draft.options.map((o, j) => (j === i ? e.target.value : o)),
                })
              }
              placeholder={`Option ${optionLetter(i)}`}
              aria-label={`Option ${optionLetter(i)}`}
              className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-[0.9375rem] text-text-primary outline-none focus:border-accent"
            />
            {isCorrect(i) && (
              <span className="shrink-0 text-success">
                <CheckIcon />
              </span>
            )}
            {/* Two is the floor — with only two left there's nothing to remove
                down to, so the control goes away rather than sitting greyed. */}
            {draft.options.length > 2 && (
              <button
                type="button"
                onClick={() => removeOption(i)}
                title="Remove option"
                aria-label={`Remove option ${optionLetter(i)}`}
                className="shrink-0 text-text-tertiary hover:text-error"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setDraft({ ...draft, options: [...draft.options, ""] })}
          className="self-start rounded-lg border border-dashed border-border-strong px-3 py-1.5 text-[0.875rem] font-medium text-text-secondary hover:border-accent hover:text-accent"
        >
          + Add option
        </button>
      </div>

      <p className="text-[0.875rem] text-text-tertiary">
        Select the radio next to the correct option. The highlighted option is currently correct.
      </p>
      </>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-[0.875rem] text-text-secondary">
          {isShort
            ? "Explanation: optional note shown with the model answer"
            : "Explanation: a sentence or two on why that option is correct"}
        </span>
        <textarea
          value={draft.explanation ?? ""}
          onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
          rows={2}
          placeholder="Optional, but shown alongside the answer in results and immediate feedback…"
          className="w-full resize-y rounded-lg border border-border bg-surface p-3 text-[0.9375rem] text-text-primary outline-none focus:border-accent"
        />
      </label>

      {!isShort && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.875rem] text-text-secondary">
            Why not the others: a sentence or two ruling out the remaining options
          </span>
          <textarea
            value={draft.whyOthersWrong ?? ""}
            onChange={(e) => setDraft({ ...draft, whyOthersWrong: e.target.value })}
            rows={2}
            placeholder="Optional, shown as a second paragraph under the explanation…"
            className="w-full resize-y rounded-lg border border-border bg-surface p-3 text-[0.9375rem] text-text-primary outline-none focus:border-accent"
          />
        </label>
      )}
    </div>
  );
}

export default function QuestionsTab({
  reviewer,
  onChanged,
}: {
  reviewer: Reviewer;
  onChanged: () => void;
}) {
  // Filters and sort ride the URL (?q=&sort=&type=&source=) so a filtered
  // view survives reloads and deep links. Seeded lazily from the URL;
  // invalid values fall back to defaults rather than sticking.
  const searchParams = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [sort, setSort] = useState<Sort>(() => {
    const s = searchParams.get("sort");
    return s === "newest" || s === "oldest" || s === "type" || s === "number" ? s : "number";
  });
  const [typeFilter, setTypeFilter] = useState<"all" | string>(
    () => searchParams.get("type") ?? "all",
  );
  // Filters, sort order, and the add-form type list follow the reviewer's
  // format rather than the global type list.
  const formats = useFormats();
  const format = resolveFromList(formats, reviewer.examFormatId);
  const typeKeys = formatTypeKeys(format);
  const typeFilters: ("all" | string)[] = ["all", ...typeKeys];
  const [sourceFilter, setSourceFilter] = useState<"all" | QuestionSource>(() => {
    const src = searchParams.get("source");
    return src === "all" || (QUESTION_SOURCES as readonly string[]).includes(src ?? "")
      ? (src as "all" | QuestionSource)
      : "all";
  });
  const [favFilter, setFavFilter] = useState<"all" | "starred">(() =>
    searchParams.get("fav") === "starred" ? "starred" : "all",
  );

  // Written back on change with replace: no history spam, no scroll jump.
  // Only non-default values are kept, so a plain view stays a clean URL.
  // Skipped when the URL already matches: a no-op replace still costs an RSC
  // round-trip, and one in flight when the network drops makes Next fall back
  // to a document navigation that dies offline.
  useEffect(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (sort !== "number") params.set("sort", sort);
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (sourceFilter !== "all") params.set("source", sourceFilter);
    if (favFilter !== "all") params.set("fav", "starred");
    const query = params.toString();
    const target = `/reviewer/${reviewer.id}?tab=questions${query ? `&${query}` : ""}`;
    if (window.location.pathname + window.location.search === target) return;
    router.replace(target, {
      scroll: false,
    });
  }, [search, sort, typeFilter, sourceFilter, favFilter, reviewer.id, router]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Question | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  // The modal is the generation UI: "loading" while the stream runs, "success"
  // once the pool is written, null the rest of the time.
  const [genState, setGenState] = useState<"loading" | "success" | null>(null);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [failures, setFailures] = useState<GenerationFailure[]>([]);
  const [verified, setVerified] = useState<VerificationSummary | null>(null);
  const [addedCount, setAddedCount] = useState<number | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(
    () =>
      typeFilter !== "all" ||
      sourceFilter !== "all" ||
      favFilter !== "all" ||
      sort !== "number",
  );
  const [hideAnswers, setHideAnswers] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);

  const generating = genState === "loading";
  // Generation calls the model — offline, the button explains instead of failing.
  const online = useOnline();

  const total = reviewer.questions.length;
  // Numbering follows stored order, so a question keeps its number no matter
  // how the list is currently filtered or sorted.
  const numberById = new Map(reviewer.questions.map((q, i) => [q.id, i + 1]));

  const term = search.trim().toLowerCase();
  const filtered = reviewer.questions.filter(
    (q) =>
      (typeFilter === "all" || q.type === typeFilter) &&
      (sourceFilter === "all" || q.source === sourceFilter) &&
      (favFilter === "all" || q.favorite === true) &&
      matchesSearch(q, term),
  );

  const visible =
    sort === "newest"
      ? [...filtered].reverse()
      : sort === "type"
        ? [...filtered].sort(
            (a, b) => typeKeys.indexOf(a.type) - typeKeys.indexOf(b.type),
          )
        : sort === "number"
          ? [...filtered].sort(
              (a, b) => (numberById.get(a.id) ?? 0) - (numberById.get(b.id) ?? 0),
            )
          : filtered;

  const activeFilterCount =
    (typeFilter !== "all" ? 1 : 0) +
    (favFilter !== "all" ? 1 : 0) +
    (sourceFilter !== "all" ? 1 : 0) +
    (sort !== "number" ? 1 : 0);

  const creating = editingId === NEW_ID && draft !== null;

  function startEdit(question: Question) {
    setEditingId(question.id);
    setDraft({
      ...question,
      options: [...question.options],
      ...(question.keyPoints ? { keyPoints: [...question.keyPoints] } : {}),
    });
    setConfirmDeleteId(null);
  }

function startCreate() {
  setEditingId(NEW_ID);
  // A new question starts in the format's own first type — "identification"
  // is only correct for formats that actually have it.
  setDraft(
    blankQuestion(
      typeKeys[0] ?? "identification",
      typeDefOf(format, typeKeys[0] ?? "")?.format === "short-answer",
    ),
  );
    setConfirmDeleteId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  function saveEdit() {
    if (!draft) return;

    // Blank key points are dropped here rather than failing the save; the
    // editor already required at least one real one.
    const toSave: Question = isShortAnswer(draft)
      ? {
          ...draft,
          modelAnswer: (draft.modelAnswer ?? "").trim(),
          keyPoints: (draft.keyPoints ?? []).map((p) => p.trim()).filter(Boolean).slice(0, MAX_KEY_POINTS),
        }
      : draft;

    if (toSave.id === NEW_ID) {
      updateReviewer(reviewer.id, {
        questions: [...reviewer.questions, { ...toSave, id: newId() }],
      });
    } else {
      // The problem text is shared by every question in the set, so an edit to it
      // has to reach the siblings too — otherwise the set would show two
      // different tables depending on which question you scrolled to.
      updateReviewer(reviewer.id, {
        questions: reviewer.questions.map((q) => {
          if (q.id === draft.id) return toSave;
          if (draft.groupId && q.groupId === draft.groupId) {
            return { ...q, groupTitle: draft.groupTitle, stimulus: draft.stimulus };
          }
          return q;
        }),
      });
    }

    onChanged();
    cancelEdit();
  }

  // Same write-then-notify pattern as the edit and delete paths above: the
  // parent re-reads the reviewer on onChanged, so the star flips immediately.
  function toggleFavorite(question: Question) {
    updateReviewer(reviewer.id, {
      questions: reviewer.questions.map((q) =>
        q.id === question.id ? { ...q, favorite: !q.favorite } : q,
      ),
    });
    onChanged();
  }

  function deleteQuestions(ids: string[]) {
    const doomed = new Set(ids);
    updateReviewer(reviewer.id, {
      questions: reviewer.questions.filter((q) => !doomed.has(q.id)),
    });
    onChanged();
    setConfirmDeleteId(null);
    setConfirmBulkDelete(false);
    setSelected((prev) => prev.filter((id) => !doomed.has(id)));
    if (editingId && doomed.has(editingId)) cancelEdit();
  }

  // Generating replaces the pool, so an existing set has to be confirmed
  // first. The dialog can keep the starred and hand-written questions.
  function handleGenerateClick() {
    if (total > 0) setConfirmOverwrite(true);
    else runGeneration([]);
  }

  // Kept questions count toward the targets, so only the shortfall per type is
  // requested and the pool does not grow past the saved counts.
  const keptQuestions = reviewer.questions.filter((q) => q.favorite === true || q.source === "manual");
  const generateCounts: Record<string, number> = {};
  for (const t of typeKeys) {
    const kept = keptQuestions.filter((q) => q.type === t).length;
    generateCounts[t] = Math.max(0, (reviewer.questionCountByType[t] ?? 0) - kept);
  }
  const remainingToGenerate = Object.values(generateCounts).reduce((a, b) => a + b, 0);
  const canKeep =
    keptQuestions.length > 0 && keptQuestions.length < total && remainingToGenerate > 0;

  async function runGeneration(keep: Question[]) {
    const controller = new AbortController();
    abortRef.current = controller;
    cancelledRef.current = false;
    setGenState("loading");
    setProgress(null);
    setGenerateError(null);
    setFailures([]);
    setVerified(null);
    setAddedCount(null);
    setCancelled(false);
    try {
      // The per-type counts are the request: a 0 means "none of these", so the
      // type list is narrowed to match rather than letting the server fall
      // back to all five.
      const byType = keep.length > 0 ? generateCounts : reviewer.questionCountByType;
      const result = await generateQuestions(
        reviewer,
        keep.length > 0 ? remainingToGenerate : reviewer.questionCount,
        typeKeys.filter((t) => byType[t] > 0),
        setProgress,
        byType,
        // The pool about to be replaced, as the list of facts already tested.
        // Set questions are left out: "Blank (2): what belongs here?" says
        // nothing about what the listing was, so it can only crowd the list.
        reviewer.questions
          .filter((q) => !q.groupId)
          .map((q) => ({
            question: q.question,
            answer: isShortAnswer(q) ? (q.modelAnswer ?? "") : (q.options[q.correctIndex] ?? ""),
          })),
        controller.signal,
      );
      // A cancel that lands in the gap between the stream finishing and this
      // line still counts as a cancel — nothing gets written behind the user.
      if (cancelledRef.current) return;
      // Written on completion, not before, so a failed generation leaves the
      // existing questions intact.
      updateReviewer(reviewer.id, {
        questions: [...keep, ...result.questions],
        questionsGeneratedAt: new Date().toISOString(),
      });
      onChanged();
      setAddedCount(result.questions.length);
      setFailures(result.failures);
      setVerified(result.verified);
      setGenState("success");
    } catch (err) {
      if (cancelledRef.current) return;
      setGenerateError(err instanceof Error ? err.message : "Generation failed.");
      setGenState(null);
      setProgress(null);
    }
  }

  // Questions only reach the client in the stream's final message, so there is
  // never a partial pool to keep: cancelling discards the run outright and
  // leaves whatever questions the reviewer already had untouched. The dialog
  // closes immediately rather than waiting on the in-flight request, which may
  // still be uploading attachments and can't be interrupted mid-upload.
  function cancelGeneration() {
    cancelledRef.current = true;
    abortRef.current?.abort();
    setGenState(null);
    setProgress(null);
    setCancelled(true);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  // Acts on what's on screen: selecting all with a filter applied never reaches
  // questions the filter is hiding.
  const visibleIds = visible.map((q) => q.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const someVisibleSelected = visibleIds.some((id) => selected.includes(id));
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Set outside render: mutating the DOM node during render is a side effect.
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = !allVisibleSelected && someVisibleSelected;
    }
  }, [allVisibleSelected, someVisibleSelected]);

  function toggleSelectAllVisible() {
    setConfirmBulkDelete(false);
    if (allVisibleSelected) {
      setSelected((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelected((prev) => [...new Set([...prev, ...visibleIds])]);
    }
  }

  const sourceNames = [
    reviewer.notes.trim() && "Notes",
    reviewer.projectMaterial.trim() && "Project material",
    reviewer.pastExamMaterial.trim() && "Past exam",
  ].filter(Boolean) as string[];
  const plannedTypes = typeKeys.filter((t) => (reviewer.questionCountByType[t] ?? 0) > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-[0.875rem] text-text-secondary sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0">
          <span className="font-medium text-text-primary">
            Will generate {reviewer.questionCount}
          </span>
          {plannedTypes.length > 0 && (
            <>
              {": "}
              {plannedTypes
                .map((t) => `${reviewer.questionCountByType[t]} ${typeLabelOf(format, t)}`)
                .join(", ")}
            </>
          )}
          {" · from "}
          {sourceNames.length > 0 ? sourceNames.join(", ") : "no material yet"}
          {" · "}
          <Link
            href={`/reviewer/${reviewer.id}?tab=details`}
            className="relative font-medium text-text-primary underline underline-offset-2 hover:text-accent after:absolute after:-inset-y-4 after:inset-x-0 after:content-[''] sm:after:hidden"
          >
            Edit details
          </Link>
        </p>
        <button
          type="button"
          onClick={handleGenerateClick}
          disabled={generating || !online}
          title={
            online
              ? `Generate ${reviewer.questionCount} questions from this reviewer's sources`
              : "Generation needs an internet connection"
          }
          className={`flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-[0.9375rem] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
            total > 0
              ? "border border-border-strong text-text-secondary enabled:hover:border-accent enabled:hover:text-text-primary"
              : "bg-accent text-on-accent enabled:hover:bg-accent-hover"
          }`}
        >
          <SparkleIcon />
          {generating ? "Generating…" : "Generate"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search questions…"
          aria-label="Search questions"
          disabled={generating}
          className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-[0.9375rem] text-text-primary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:min-w-[220px] sm:flex-1"
        />
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
          aria-controls="question-filters"
          className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-border-strong px-4 text-[0.9375rem] font-medium text-text-secondary hover:border-accent hover:text-text-primary sm:flex-none sm:shrink-0"
        >
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          <CaretIcon className={filtersOpen ? "rotate-180" : ""} />
        </button>
        <button
          type="button"
          onClick={startCreate}
          disabled={generating}
          className="h-11 min-w-0 flex-1 rounded-lg border border-border-strong px-4 text-[0.9375rem] font-medium text-text-secondary enabled:hover:border-accent enabled:hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:shrink-0"
        >
          <span className="sm:hidden" aria-hidden="true">+ Add</span>
          <span className="sr-only sm:not-sr-only">+ Add question</span>
        </button>
      </div>

      {!online && (
        <p className="text-[0.875rem] text-text-secondary">
          You&apos;re offline. Quizzing works, but generation needs a connection.
        </p>
      )}

      {!generating && generateError && (
        <p className="text-[0.9375rem] text-error">{generateError}</p>
      )}

      {cancelled && (
        <p className="text-[0.9375rem] text-text-secondary">
          Generation cancelled. Your questions are unchanged.
        </p>
      )}

      {!generating && failures.length > 0 && (
        <ul className="ml-5 list-disc text-[0.875rem] text-text-secondary">
          {failures.map((f) => (
            <li key={f.label}>
              <span className="font-medium text-text-primary">{f.label}</span>: {f.reason}
            </li>
          ))}
        </ul>
      )}

      {!generating && verified && (verified.corrected > 0 || verified.dropped > 0) && (
        <p className="text-[0.875rem] text-text-secondary">
          Answer check: {verified.corrected > 0 && `fixed ${verified.corrected} wrong answer${verified.corrected === 1 ? "" : "s"}`}
          {verified.corrected > 0 && verified.dropped > 0 && ", "}
          {verified.dropped > 0 && `dropped ${verified.dropped} unanswerable question${verified.dropped === 1 ? "" : "s"}`}.
        </p>
      )}

      {/* Type chips, Starred, Source, and Sort sit behind the Filters button.
          It opens by default only when a filter is active. */}
      <div
        id="question-filters"
        className={`${filtersOpen ? "flex" : "hidden"} flex-col gap-3 rounded-lg border border-border bg-surface-alt px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.875rem] text-text-secondary">Type</span>
          {typeFilters.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`rounded-lg px-2.5 py-3 text-[0.875rem] font-medium sm:py-1 ${
                typeFilter === t
                  ? "bg-accent text-on-accent"
                  : "border border-border-strong text-text-secondary hover:text-text-primary"
              }`}
            >
              {t === "all" ? "All" : typeLabelOf(format, t)}
            </button>
          ))}
        </div>

        <div className="mx-2 hidden h-6 w-px bg-border-strong sm:block" />

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFavFilter(favFilter === "starred" ? "all" : "starred")}
            aria-pressed={favFilter === "starred"}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-3 text-[0.875rem] font-medium sm:py-1 ${
              favFilter === "starred"
                ? "bg-accent text-on-accent"
                : "border border-border-strong text-text-secondary hover:text-text-primary"
            }`}
          >
            <StarIcon filled={favFilter === "starred"} />
            Starred
          </button>
        </div>

        <div className="mx-2 hidden h-6 w-px bg-border-strong sm:block" />

        <div className="flex flex-wrap items-center gap-2 sm:flex-1">
          <label className="flex min-w-0 items-center gap-2">
            <span className="text-[0.875rem] text-text-secondary">Source</span>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as "all" | QuestionSource)}
              aria-label="Filter by source"
              className="h-11 min-w-0 rounded-lg border border-border bg-surface px-2 text-[0.875rem] text-text-primary outline-none focus:border-accent sm:h-8"
            >
              {SOURCE_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All" : SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label="Sort questions"
            disabled={generating}
            className="h-11 min-w-0 rounded-lg border border-border bg-surface px-2 text-[0.875rem] text-text-primary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-40 sm:h-8"
          >
            <option value="newest">Sort: Newest</option>
            <option value="oldest">Sort: Oldest</option>
            <option value="number">Sort: By number</option>
            <option value="type">Sort: By type</option>
          </select>
        </div>
      </div>

      {creating && draft && (
        <div className="rounded-lg border border-dashed border-border-strong p-4">
          <QuestionEditor
            draft={draft}
            setDraft={setDraft}
            number={undefined}
            types={typeKeys}
            format={format}
            onSave={saveEdit}
            onCancel={cancelEdit}
          />
        </div>
      )}

      {total === 0 ? (
        <p className="text-[0.9375rem] text-text-secondary">
          No questions yet. Add your notes in the Details tab, then hit Generate. You can also add
          one by hand.
        </p>
      ) : visible.length === 0 ? (
        <p className="text-[0.9375rem] text-text-secondary">No questions match these filters.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              ref={selectAllRef}
              onChange={toggleSelectAllVisible}
              aria-label={`Select all ${visible.length} question${visible.length === 1 ? "" : "s"}`}
              className="h-4 w-4 shrink-0 accent-accent"
            />

            {selected.length === 0 ? (
              <>
                <span className="text-[0.9375rem] text-text-secondary">
                  Select all {visible.length} question{visible.length === 1 ? "" : "s"}
                  {visible.length !== total && ` (of ${total})`}
                </span>
                <label className="ml-auto flex min-h-11 cursor-pointer items-center gap-2 text-[0.875rem] text-text-secondary">
                  <input
                    type="checkbox"
                    checked={hideAnswers}
                    onChange={(e) => setHideAnswers(e.target.checked)}
                    className="h-4 w-4 accent-accent"
                  />
                  Hide answers
                </label>
              </>
            ) : (
              <>
                <span className="text-[0.9375rem] text-text-primary">{selected.length} selected</span>
                <div className="ml-auto flex items-center gap-4 text-[0.875rem]">
                  {confirmBulkDelete ? (
                    <>
                      <span className="text-text-secondary">
                        Really delete {selected.length} question
                        {selected.length === 1 ? "" : "s"}?
                      </span>
                      <button
                        onClick={() => deleteQuestions(selected)}
                        className="font-medium text-error hover:underline"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmBulkDelete(false)}
                        className="font-medium text-text-secondary hover:text-text-primary"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setSelected([])}
                        className="font-medium text-text-secondary hover:text-text-primary"
                      >
                        Clear selection
                      </button>
                      <button
                        onClick={() => setConfirmBulkDelete(true)}
                        className="font-medium text-error hover:underline"
                      >
                        Delete selected
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          <ul className="flex flex-col">
          {visible.map((question) => {
            const isEditing = editingId === question.id && draft !== null;
            const number = numberById.get(question.id);

            return (
              <li key={question.id} className="flex gap-3 border-t border-border py-5 last:border-b">
                <input
                  type="checkbox"
                  checked={selected.includes(question.id)}
                  onChange={() => toggleSelected(question.id)}
                  aria-label={`Select question ${number}`}
                  className="mt-1 h-4 w-4 shrink-0 accent-accent"
                />

                <div className="min-w-0 flex-1">
                  {isEditing && draft ? (
                    <QuestionEditor
                      draft={draft}
                      setDraft={setDraft}
                      number={number}
                      types={typeKeys}
                      format={format}
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                    />
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                        <span className="min-w-0 break-words font-mono text-[0.8125rem] tracking-wide uppercase">
                          <span className="font-semibold text-text-primary">{number}.</span>{" "}
                          <span className="font-normal text-text-tertiary">
                            {typeLabelOf(format, question.type)} · {SOURCE_LABELS[question.source]}
                          </span>
                        </span>

                        {/* `ml-auto` so that when this drops to its own row on a
                            narrow screen it lands right-aligned instead of
                            stacking flush under the label. Below `sm` it's also
                            a size and weight lighter than that label, so the
                            two don't read as equals. */}
                        <div className="ml-auto flex shrink-0 items-center gap-1 text-[0.8125rem] sm:gap-3 sm:text-[0.875rem]">
                          {confirmDeleteId === question.id ? (
                            <>
                              <span className="text-text-secondary">
                                Really delete this question?
                              </span>
                              <button
                                onClick={() => deleteQuestions([question.id])}
                                className="flex h-11 items-center px-2 text-error hover:underline sm:h-auto sm:px-0 sm:font-medium"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="flex h-11 items-center px-2 text-text-secondary hover:text-text-primary sm:h-auto sm:px-0 sm:font-medium"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => toggleFavorite(question)}
                                aria-pressed={question.favorite === true}
                                aria-label={`${question.favorite ? "Unstar" : "Star"} question ${number}`}
                                title={question.favorite ? "Starred" : "Star this question"}
                                className={`flex h-11 items-center justify-center gap-1.5 rounded-lg px-2 sm:h-auto sm:rounded-none sm:px-0 sm:font-medium ${
                                  question.favorite
                                    ? "text-accent"
                                    : "text-text-tertiary hover:text-text-primary sm:text-text-secondary"
                                }`}
                              >
                                <StarIcon filled={question.favorite === true} />
                                {question.favorite ? "Starred" : "Star"}
                              </button>
                              <button
                                onClick={() => startEdit(question)}
                                className="flex h-11 items-center px-2 text-text-secondary hover:text-text-primary sm:h-auto sm:px-0 sm:font-medium"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(question.id)}
                                className="flex h-11 items-center px-2 text-text-secondary hover:text-error sm:h-auto sm:px-0 sm:font-medium"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {question.stimulus &&
                        // A mono-kind stimulus (table, code, formula) opens as
                        // a preformatted block; prose rides as a quote. Matches
                        // the quiz and results screens branch for branch.
                        (isMonoKind(stimulusKindOf(format, question.type)) ? (
                          <details open className="mt-2">
                            <summary className="cursor-pointer text-[0.875rem] text-text-secondary hover:text-text-primary">
                              {question.groupTitle || "The problem"}
                            </summary>
                            <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface-alt p-4 font-mono text-[0.875rem] leading-relaxed text-text-primary">
                              {question.stimulus}
                            </pre>
                          </details>
                        ) : (
                          <StimulusQuote stimulus={question.stimulus} />
                        ))}

                      <p
                        className={`mt-2 text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-text-primary ${
                          isPreformatted(question.type) && !question.stimulus ? "font-mono" : ""
                        }`}
                      >
                        {question.question}
                      </p>

                      {isShortAnswer(question) && !hideAnswers && (
                        <div className="mt-3 flex flex-col gap-2 rounded-lg bg-success-subtle px-3 py-2.5 text-[0.9375rem]">
                          <p className="text-text-primary">
                            <span className="font-medium text-success">Model answer:</span>{" "}
                            {question.modelAnswer}
                          </p>
                          <ul className="flex flex-col gap-1 text-text-secondary">
                            {(question.keyPoints ?? []).map((point, i) => (
                              <li key={i} className="flex gap-2">
                                <span className="font-mono text-[0.8125rem] text-text-tertiary">{i + 1}.</span>
                                <span className="min-w-0 break-words">{point}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <ol className="mt-3 flex flex-col gap-1">
                        {question.options.map((option, i) => (
                          <li
                            key={i}
                            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[0.9375rem] ${
                              i === question.correctIndex && !hideAnswers
                                ? "bg-success-subtle font-medium text-text-primary"
                                : "text-text-secondary"
                            }`}
                          >
                            <span className="font-mono text-[0.8125rem] text-text-secondary">
                              {optionLetter(i)}.
                            </span>
                            <span className="min-w-0 break-words">{option}</span>
                            {i === question.correctIndex && !hideAnswers && (
                              <span className="ml-auto flex shrink-0 items-center gap-1 text-[0.8125rem] text-text-primary">
                                <span className="text-success">
                                  <CheckIcon />
                                </span>
                                Correct
                              </span>
                            )}
                          </li>
                        ))}
                      </ol>

                      {!hideAnswers && question.explanation && (
                        <p className="mt-3 text-[0.875rem] leading-relaxed text-text-secondary">
                          <span className="font-medium text-text-primary">Explanation:</span>{" "}
                          {question.explanation}
                        </p>
                      )}

                      {!hideAnswers && question.whyOthersWrong && (
                        <p className="mt-2 text-[0.875rem] leading-relaxed text-text-secondary">
                          <span className="font-medium text-text-primary">Why not the others:</span>{" "}
                          {question.whyOthersWrong}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
          </ul>
        </>
      )}

      {genState && (
        <GenerationModal
          state={genState}
          progress={progress}
          count={addedCount ?? 0}
          onCancel={cancelGeneration}
          onDone={() => setGenState(null)}
        />
      )}

      {confirmOverwrite && (
        <ConfirmDialog
          title="Generate new questions?"
          body={`This reviewer has ${total} question${total === 1 ? "" : "s"}. You cannot undo this.`}
          confirmLabel="Replace all"
          destructive
          onConfirm={() => {
            setConfirmOverwrite(false);
            runGeneration([]);
          }}
          secondaryLabel="Keep starred and hand-written"
          secondaryDisabled={!canKeep}
          onSecondary={() => {
            setConfirmOverwrite(false);
            runGeneration(keptQuestions);
          }}
          onCancel={() => setConfirmOverwrite(false)}
        >
          <ul className="mt-3 flex flex-col gap-2 text-[0.875rem] text-text-secondary">
            <li>
              <span className="font-medium text-text-primary">Keep starred and hand-written:</span>{" "}
              {keptQuestions.length} stay. The other {total - keptQuestions.length} are removed.
            </li>
            <li>
              <span className="font-medium text-text-primary">Replace all:</span> all {total} are
              removed, starred and hand-written too.
            </li>
          </ul>
          {!canKeep && (
            <p className="mt-3 text-[0.875rem] text-text-secondary">
              {keptQuestions.length === 0
                ? "You have no starred or hand-written questions to keep."
                : keptQuestions.length >= total
                  ? "Every question is starred or hand-written, so there is nothing to replace."
                  : "Your kept questions already meet the saved counts, so nothing is left to generate."}
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

