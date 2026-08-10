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

function CaretIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      className="pointer-events-none shrink-0"
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
  label,
  onSave,
  onCancel,
}: {
  draft: Question;
  setDraft: (q: Question) => void;
  label: string;
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
          <span className="font-mono text-[13px] tracking-wide text-text-tertiary uppercase">
            {label} · Type:
          </span>
          <span className="inline-flex items-center gap-0.5 rounded px-1 text-text-secondary hover:bg-surface-alt">
            <select
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as QuestionType })}
              aria-label="Question type"
              className="cursor-pointer appearance-none border-0 bg-transparent p-0 font-mono text-[13px] tracking-wide text-inherit uppercase outline-none hover:underline focus:underline"
            >
              {QUESTION_TYPES.map((t) => (
                <option key={t} value={t} className="normal-case">
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <CaretIcon />
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
    </div>
  );
}

export default function EditQuestionsTab({
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
          className="h-11 min-w-[220px] flex-1 rounded-lg border border-border bg-surface px-3 text-[15px] text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort questions"
          className="h-11 shrink-0 rounded-lg border border-border bg-surface px-3 text-[15px] text-text-primary outline-none focus:border-accent"
        >
          <option value="newest">Sort: Newest</option>
          <option value="oldest">Sort: Oldest</option>
          <option value="number">Sort: By number</option>
          <option value="type">Sort: By type</option>
        </select>
        <button
          type="button"
          onClick={startCreate}
          className="h-11 shrink-0 rounded-lg bg-accent px-4 text-[15px] font-medium text-white hover:bg-accent-hover"
        >
          + Add question
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-alt px-4 py-3">
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

        <div className="mx-2 h-6 w-px bg-border-strong" />

        <span className="text-[14px] text-text-secondary">Source</span>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as "all" | QuestionSource)}
          aria-label="Filter by source"
          className="h-8 rounded-lg border border-border bg-surface px-2 text-[14px] text-text-primary outline-none focus:border-accent"
        >
          {SOURCE_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All" : SOURCE_LABELS[s]}
            </option>
          ))}
        </select>

        <span className="ml-auto text-[14px] text-text-tertiary">
          {total} question{total === 1 ? "" : "s"} total
        </span>
      </div>

      {creating && draft && (
        <div className="rounded-lg border border-dashed border-border-strong p-4">
          <QuestionEditor
            draft={draft}
            setDraft={setDraft}
            label="New question"
            onSave={saveEdit}
            onCancel={cancelEdit}
          />
        </div>
      )}

      {total === 0 ? (
        <p className="text-[15px] text-text-secondary">
          No questions yet — generate some in the Sources tab, or add one by hand.
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
                      label={`Question ${number} of ${total}`}
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                    />
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-6">
                        <span className="shrink-0 font-mono text-[13px] tracking-wide text-text-tertiary uppercase">
                          Question {number} of {total} · {TYPE_LABELS[question.type]} ·{" "}
                          {SOURCE_LABELS[question.source]}
                        </span>

                        <div className="flex shrink-0 items-center gap-3 text-[14px]">
                          {confirmDeleteId === question.id ? (
                            <>
                              <span className="text-text-secondary">
                                Really delete this question?
                              </span>
                              <button
                                onClick={() => deleteQuestions([question.id])}
                                className="font-medium text-error hover:underline"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="font-medium text-text-secondary hover:text-text-primary"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(question)}
                                className="font-medium text-text-secondary hover:text-text-primary"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(question.id)}
                                className="font-medium text-text-secondary hover:text-error"
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
                    </>
                  )}
                </div>
              </li>
            );
          })}
          </ul>
        </>
      )}
    </div>
  );
}

