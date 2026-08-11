"use client";

import { useState } from "react";
import { updateReviewer } from "@/app/lib/storage";
import {
  QUESTION_SOURCES,
  QUESTION_TYPES,
  SOURCE_LABELS,
  TYPE_LABELS,
  isPreformatted,
  optionLetter,
} from "@/app/lib/questions";
import {
  generateQuestions,
  type GenerationFailure,
  type GenerationProgress,
} from "@/app/lib/generate";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import type { Question, QuestionSource, QuestionType, Reviewer } from "@/app/types";

const TYPE_FILTERS: ("all" | QuestionType)[] = ["all", ...QUESTION_TYPES];
const SOURCE_FILTERS: ("all" | QuestionSource)[] = ["all", ...QUESTION_SOURCES];

type Sort = "newest" | "oldest" | "type" | "number";

// Sentinel id for the not-yet-saved question, so the create card can reuse the
// exact same draft state and editor as an existing question being edited.
const NEW_ID = "__new__";

function blankQuestion(): Question {
  return {
    id: NEW_ID,
    type: "identification",
    question: "",
    options: ["", ""],
    correctIndex: 0,
    source: "manual",
    explanation: "",
    whyOthersWrong: "",
  };
}

function matchesSearch(question: Question, term: string): boolean {
  if (!term) return true;
  return (
    question.question.toLowerCase().includes(term) ||
    question.options.some((o) => o.toLowerCase().includes(term))
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

function QuestionEditor({
  draft,
  setDraft,
  number,
  onSave,
  onCancel,
}: {
  draft: Question;
  setDraft: (q: Question) => void;
  number: number | undefined;
  onSave: () => void;
  onCancel: () => void;
}) {
  // A brand-new question starts with no answer picked at all — `correctIndex`
  // defaults to 0 for the data model's sake, but nothing is shown as correct
  // until the user actually selects a radio on an option that has text.
  const [picked, setPicked] = useState(draft.id !== NEW_ID);
  const isCorrect = (i: number) =>
    picked && draft.correctIndex === i && draft.options[i].trim() !== "";

  const filled = draft.options.filter((o) => o.trim()).length;
  const answerChosen = draft.options.some((_, i) => isCorrect(i));
  const canSave = draft.question.trim() !== "" && filled >= 2 && answerChosen;

  function saveHint(): string | undefined {
    if (draft.question.trim() === "") return "Add question text first";
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
          <span className="font-mono text-[13px] tracking-wide">
            <span className="text-[14px] font-bold text-text-primary">
              {number !== undefined ? `${number}.` : "New"}
            </span>{" "}
            <span className="text-text-tertiary uppercase">· Type:</span>
          </span>
          <span className="relative inline-flex shrink-0 items-center rounded px-1 text-text-secondary hover:bg-surface-alt">
            <select
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as QuestionType })}
              aria-label="Question type"
              className="cursor-pointer appearance-none border-0 bg-transparent p-0 pr-4 font-mono text-[13px] tracking-wide text-inherit uppercase outline-none hover:underline focus:underline"
            >
              {QUESTION_TYPES.map((t) => (
                <option key={t} value={t} className="normal-case">
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <CaretIcon className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2" />
          </span>
          <span className="font-mono text-[13px] tracking-wide text-text-tertiary uppercase">
            · Source: {SOURCE_LABELS[draft.source]}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-3 text-[14px]">
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
            className="rounded-lg bg-accent px-3 py-1.5 font-medium text-white enabled:hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>

      {draft.stimulus !== undefined && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] text-text-secondary">
            Problem shared by this set — editing it updates every question in the set
          </span>
          <textarea
            value={draft.stimulus}
            onChange={(e) => setDraft({ ...draft, stimulus: e.target.value })}
            rows={10}
            className="w-full rounded-lg border border-border bg-surface p-3 font-mono text-[14px] text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
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
        className={`w-full resize-y rounded-lg border border-border bg-surface p-3 text-[15px] text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 ${
          isPreformatted(draft.type) ? "font-mono" : ""
        }`}
      />

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
              aria-label={`Mark option ${i + 1} correct`}
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
              aria-label={`Option ${i + 1}`}
              className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-[15px] text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
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
                aria-label={`Remove option ${i + 1}`}
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
          className="self-start rounded-lg border border-dashed border-border-strong px-3 py-1.5 text-[14px] font-medium text-text-secondary hover:border-accent hover:text-accent"
        >
          + Add option
        </button>
      </div>

      <p className="text-[14px] text-text-tertiary">
        Select the radio next to the correct option. The highlighted option is currently correct.
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-[14px] text-text-secondary">
          Explanation — a sentence or two on why that option is correct
        </span>
        <textarea
          value={draft.explanation ?? ""}
          onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
          rows={2}
          placeholder="Optional, but shown alongside the answer in results and immediate feedback…"
          className="w-full resize-y rounded-lg border border-border bg-surface p-3 text-[15px] text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[14px] text-text-secondary">
          Why not the others — a sentence or two ruling out the remaining options
        </span>
        <textarea
          value={draft.whyOthersWrong ?? ""}
          onChange={(e) => setDraft({ ...draft, whyOthersWrong: e.target.value })}
          rows={2}
          placeholder="Optional, shown as a second paragraph under the explanation…"
          className="w-full resize-y rounded-lg border border-border bg-surface p-3 text-[15px] text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </label>
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
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("number");
  const [typeFilter, setTypeFilter] = useState<"all" | QuestionType>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | QuestionSource>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Question | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [failures, setFailures] = useState<GenerationFailure[]>([]);
  const [addedCount, setAddedCount] = useState<number | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  const total = reviewer.questions.length;
  // Numbering follows stored order, so a question keeps its number no matter
  // how the list is currently filtered or sorted.
  const numberById = new Map(reviewer.questions.map((q, i) => [q.id, i + 1]));

  const term = search.trim().toLowerCase();
  const filtered = reviewer.questions.filter(
    (q) =>
      (typeFilter === "all" || q.type === typeFilter) &&
      (sourceFilter === "all" || q.source === sourceFilter) &&
      matchesSearch(q, term),
  );

  const visible =
    sort === "newest"
      ? [...filtered].reverse()
      : sort === "type"
        ? [...filtered].sort(
            (a, b) => QUESTION_TYPES.indexOf(a.type) - QUESTION_TYPES.indexOf(b.type),
          )
        : sort === "number"
          ? [...filtered].sort(
              (a, b) => (numberById.get(a.id) ?? 0) - (numberById.get(b.id) ?? 0),
            )
          : filtered;

  const creating = editingId === NEW_ID && draft !== null;

  function startEdit(question: Question) {
    setEditingId(question.id);
    setDraft({ ...question, options: [...question.options] });
    setConfirmDeleteId(null);
  }

  function startCreate() {
    setEditingId(NEW_ID);
    setDraft(blankQuestion());
    setConfirmDeleteId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  function saveEdit() {
    if (!draft) return;

    if (draft.id === NEW_ID) {
      updateReviewer(reviewer.id, {
        questions: [...reviewer.questions, { ...draft, id: crypto.randomUUID() }],
      });
    } else {
      // The problem text is shared by every question in the set, so an edit to it
      // has to reach the siblings too — otherwise the set would show two
      // different tables depending on which question you scrolled to.
      updateReviewer(reviewer.id, {
        questions: reviewer.questions.map((q) => {
          if (q.id === draft.id) return draft;
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

  // Generating replaces the whole pool, so an existing set has to be confirmed
  // away first — same guard the Sources tab's Generate bar used to apply.
  function handleGenerateClick() {
    if (total > 0) setConfirmOverwrite(true);
    else runGeneration();
  }

  async function runGeneration() {
    setGenerating(true);
    setProgress(null);
    setGenerateError(null);
    setFailures([]);
    setAddedCount(null);
    try {
      // The per-type counts are the request: a 0 means "none of these", so the
      // type list is narrowed to match rather than letting the server fall
      // back to all four.
      const byType = reviewer.questionCountByType;
      const result = await generateQuestions(
        reviewer,
        reviewer.questionCount,
        QUESTION_TYPES.filter((t) => byType[t] > 0),
        setProgress,
        byType,
      );
      // Written on completion, not before, so a failed generation leaves the
      // existing questions intact.
      updateReviewer(reviewer.id, { questions: result.questions });
      onChanged();
      setAddedCount(result.questions.length);
      setFailures(result.failures);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setGenerating(false);
      setProgress(null);
    }
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

  function toggleSelectAllVisible() {
    setConfirmBulkDelete(false);
    if (allVisibleSelected) {
      setSelected((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelected((prev) => [...new Set([...prev, ...visibleIds])]);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search questions…"
          aria-label="Search questions"
          disabled={generating}
          className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-[15px] text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:min-w-[220px] sm:flex-1"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort questions"
          disabled={generating}
          className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-[15px] text-text-primary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:shrink-0"
        >
          <option value="newest">Sort: Newest</option>
          <option value="oldest">Sort: Oldest</option>
          <option value="number">Sort: By number</option>
          <option value="type">Sort: By type</option>
        </select>
        <button
          type="button"
          onClick={startCreate}
          disabled={generating}
          className="h-11 min-w-0 flex-1 rounded-lg border border-border-strong px-4 text-[15px] font-medium text-text-secondary enabled:hover:border-accent enabled:hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:shrink-0"
        >
          + Add question
        </button>
        <button
          type="button"
          onClick={handleGenerateClick}
          disabled={generating}
          title={`Generate ${reviewer.questionCount} questions from this reviewer's sources`}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-[15px] font-medium text-white enabled:hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:shrink-0"
        >
          <SparkleIcon />
          {generating ? "Generating…" : "Generate"}
        </button>
      </div>

      {generating && (
        <div className="rounded-lg border border-border bg-surface-alt px-4 py-3">
          <p className="text-[15px] text-text-secondary">
            {progress
              ? `Generating questions… ${progress.completed} of ${progress.total} source${
                  progress.total === 1 ? "" : "s"
                }`
              : "Generating questions…"}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{
                width: progress ? `${Math.round((progress.completed / progress.total) * 100)}%` : "0%",
              }}
            />
          </div>
        </div>
      )}

      {!generating && generateError && (
        <p className="text-[15px] text-error">{generateError}</p>
      )}

      {!generating && addedCount !== null && (
        <p className="text-[15px] text-success">
          {addedCount} question{addedCount === 1 ? "" : "s"} generated.
        </p>
      )}

      {!generating && failures.length > 0 && (
        <ul className="ml-5 list-disc text-[14px] text-text-secondary">
          {failures.map((f) => (
            <li key={f.label}>
              <span className="font-medium text-text-primary">{f.label}</span> — {f.reason}
            </li>
          ))}
        </ul>
      )}

      {/* Two groups rather than one long wrapping run of controls: below `sm`
          they stack as whole rows, so the chips can't leave a stray chip sitting
          on the dropdown's line with a mismatched baseline. Above `sm` the
          groups flow back into the single row they always were. */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-alt px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] text-text-secondary">Type</span>
          {TYPE_FILTERS.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`rounded-lg px-2.5 py-1 text-[14px] font-medium ${
                typeFilter === t
                  ? "bg-accent text-white"
                  : "border border-border-strong text-text-secondary hover:text-text-primary"
              }`}
            >
              {t === "all" ? "All" : TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="mx-2 hidden h-6 w-px bg-border-strong sm:block" />

        <div className="flex items-center gap-2 sm:flex-1">
          <span className="shrink-0 text-[14px] text-text-secondary">Source</span>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as "all" | QuestionSource)}
            aria-label="Filter by source"
            className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-[14px] text-text-primary outline-none focus:border-accent sm:flex-none"
          >
            {SOURCE_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All" : SOURCE_LABELS[s]}
              </option>
            ))}
          </select>

          <span className="ml-auto shrink-0 pl-2 text-[14px] text-text-tertiary">
            {total} question{total === 1 ? "" : "s"} total
          </span>
        </div>
      </div>

      {creating && draft && (
        <div className="rounded-lg border border-dashed border-border-strong p-4">
          <QuestionEditor
            draft={draft}
            setDraft={setDraft}
            number={undefined}
            onSave={saveEdit}
            onCancel={cancelEdit}
          />
        </div>
      )}

      {total === 0 ? (
        <p className="text-[15px] text-text-secondary">
          No questions yet — add your notes in the Details tab, then hit Generate. You can also add
          one by hand.
        </p>
      ) : visible.length === 0 ? (
        <p className="text-[15px] text-text-secondary">No questions match these filters.</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              ref={(el) => {
                if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected;
              }}
              onChange={toggleSelectAllVisible}
              aria-label={`Select all ${visible.length} question${visible.length === 1 ? "" : "s"}`}
              className="h-4 w-4 shrink-0 accent-accent"
            />

            {selected.length === 0 ? (
              <span className="text-[15px] text-text-secondary">
                Select all {visible.length} question{visible.length === 1 ? "" : "s"}
              </span>
            ) : (
              <>
                <span className="text-[15px] text-text-primary">{selected.length} selected</span>
                <div className="ml-auto flex items-center gap-4 text-[14px]">
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
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                    />
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                        <span className="shrink-0 font-mono text-[13px] tracking-wide uppercase">
                          <span className="font-semibold text-text-secondary">Question {number}</span>{" "}
                          <span className="font-normal text-text-tertiary">
                            · {TYPE_LABELS[question.type]} · {SOURCE_LABELS[question.source]}
                          </span>
                        </span>

                        {/* `ml-auto` so that when this drops to its own row on a
                            narrow screen it lands right-aligned instead of
                            stacking flush under the label. Below `sm` it's also
                            a size and weight lighter than that label, so the
                            two don't read as equals. */}
                        <div className="ml-auto flex shrink-0 items-center gap-3 text-[13px] sm:text-[14px]">
                          {confirmDeleteId === question.id ? (
                            <>
                              <span className="text-text-tertiary sm:text-text-secondary">
                                Really delete this question?
                              </span>
                              <button
                                onClick={() => deleteQuestions([question.id])}
                                className="text-error hover:underline sm:font-medium"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="text-text-tertiary hover:text-text-primary sm:font-medium sm:text-text-secondary"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(question)}
                                className="text-text-tertiary hover:text-text-primary sm:font-medium sm:text-text-secondary"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(question.id)}
                                className="text-text-tertiary hover:text-error sm:font-medium sm:text-text-secondary"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {question.stimulus &&
                        (isPreformatted(question.type) ? (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-[14px] text-text-secondary hover:text-text-primary">
                              {question.groupTitle || "Show the problem"}
                            </summary>
                            <pre className="mt-2 overflow-x-auto rounded-r-lg border-l-2 border-accent bg-surface-alt p-4 font-mono text-[14px] leading-relaxed text-text-primary">
                              {question.stimulus}
                            </pre>
                          </details>
                        ) : (
                          <blockquote className="mt-2 border-l-2 border-accent pl-3 text-[15px] leading-relaxed whitespace-pre-wrap text-text-secondary italic">
                            {question.stimulus}
                          </blockquote>
                        ))}

                      <p
                        className={`mt-2 text-[15px] leading-relaxed whitespace-pre-wrap text-text-primary ${
                          isPreformatted(question.type) && !question.stimulus ? "font-mono" : ""
                        }`}
                      >
                        {question.question}
                      </p>

                      <ol className="mt-3 flex flex-col gap-1">
                        {question.options.map((option, i) => (
                          <li
                            key={i}
                            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[15px] ${
                              i === question.correctIndex
                                ? "bg-success-subtle font-medium text-success"
                                : "text-text-secondary"
                            }`}
                          >
                            <span className="font-mono text-[13px] text-text-tertiary">
                              {optionLetter(i)}.
                            </span>
                            <span className="min-w-0 break-words">{option}</span>
                            {i === question.correctIndex && (
                              <span className="shrink-0 text-success">
                                <CheckIcon />
                              </span>
                            )}
                          </li>
                        ))}
                      </ol>

                      {question.explanation && (
                        <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">
                          <span className="font-medium text-text-primary">Explanation:</span>{" "}
                          {question.explanation}
                        </p>
                      )}

                      {question.whyOthersWrong && (
                        <p className="mt-2 text-[14px] leading-relaxed text-text-secondary">
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

      {confirmOverwrite && (
        <ConfirmDialog
          title="Overwrite existing questions?"
          body={`This reviewer already has ${total} question${
            total === 1 ? "" : "s"
          }. Generating new questions will replace all of them. This can't be undone.`}
          confirmLabel="Overwrite and generate"
          destructive
          onConfirm={() => {
            setConfirmOverwrite(false);
            runGeneration();
          }}
          onCancel={() => setConfirmOverwrite(false)}
        />
      )}
    </div>
  );
}

