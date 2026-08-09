"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { groupQuestions, isPreformatted, optionLetter } from "@/app/lib/questions";
import type { FeedbackMode, Question } from "@/app/types";

export type Answers = Record<string, number>;

const BLANK_MARKER = /(_{2,}\(\d+\)_{2,})/g;

// A stimulus wide enough to scroll gives no hint that it does; the fade only
// shows while there's still content past the right edge.
function StimulusBlock({ stimulus }: { stimulus: string }) {
  const [atEnd, setAtEnd] = useState(true);

  function measure(el: HTMLPreElement | null) {
    if (!el) return;
    setAtEnd(Math.ceil(el.scrollLeft + el.clientWidth) >= el.scrollWidth);
  }

  // Every blank is highlighted, not just the one whose question is in view —
  // a blank can sit well above or below its question, so tying the highlight to
  // scroll position left the one you were actually working on unmarked.
  const parts = stimulus.split(BLANK_MARKER).filter((part) => part !== "");

  return (
    <div className="relative mt-3">
      <pre
        ref={measure}
        onScroll={(e) => measure(e.currentTarget)}
        className="overflow-x-auto rounded-lg border border-border bg-surface-alt p-4 font-mono text-[14px] leading-relaxed text-text-primary"
      >
        {parts.map((part, i) => {
          const marker = part.match(/^_{2,}\((\d+)\)_{2,}$/);
          return marker ? (
            <mark key={i} className="rounded bg-info-subtle px-1 font-bold text-info">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          );
        })}
      </pre>
      {!atEnd && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-px right-px w-10 rounded-r-lg bg-gradient-to-l from-surface-alt to-transparent"
        />
      )}
    </div>
  );
}

export default function QuizTaking({
  questions,
  feedbackMode,
  onSubmit,
  onCancel,
}: {
  questions: Question[];
  feedbackMode: FeedbackMode;
  onSubmit: (answers: Answers, unsureIds: string[]) => void;
  onCancel: () => void;
}) {
  const [answers, setAnswers] = useState<Answers>({});
  const [unsureIds, setUnsureIds] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const visibleIds = useRef(new Set<string>());

  // Timeline/Code questions arrive as contiguous sets over one shared problem;
  // the problem is rendered once at the head of the set. Numbering stays global
  // so it keeps matching the jump-to grid in the sidebar.
  const groups = useMemo(() => groupQuestions(questions), [questions]);
  const numbering = useMemo(
    () => new Map(questions.map((q, i) => [q.id, i + 1])),
    [questions],
  );

  const answeredCount = Object.keys(answers).length;
  const unansweredCount = questions.length - answeredCount;
  const showFeedback = feedbackMode === "immediate";

  // Which question the reader is actually on, so the grid can show position
  // independently of answered/unsure status. The band ignores anything below
  // the upper third of the viewport, so "active" tracks what's being read
  // rather than whatever happens to be on screen.
  useEffect(() => {
    const visible = visibleIds.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id.replace("question-", "");
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        const first = questions.find((q) => visible.has(q.id));
        if (first) setActiveId(first.id);
      },
      { rootMargin: "-10% 0px -65% 0px" },
    );

    for (const question of questions) {
      const el = document.getElementById(`question-${question.id}`);
      if (el) observer.observe(el);
    }
    return () => {
      observer.disconnect();
      visible.clear();
    };
  }, [questions]);

  function selectOption(questionId: string, optionIndex: number) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
  }

  function clearSelection(questionId: string) {
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  }

  function toggleUnsure(questionId: string) {
    setUnsureIds((prev) =>
      prev.includes(questionId) ? prev.filter((id) => id !== questionId) : [...prev, questionId],
    );
  }

  function jumpTo(questionId: string) {
    document.getElementById(`question-${questionId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function handleSubmit() {
    if (unansweredCount > 0) {
      setConfirmOpen(true);
      return;
    }
    onSubmit(answers, unsureIds);
  }

  return (
    <div className="flex gap-10">
      <div className="min-w-0 flex-1">
        <div className="flex flex-col">
          {groups.map((group) => (
            <section key={group.key} className="border-t border-border last:border-b">
              {group.stimulus && (
                <div className="pt-6">
                  <p className="font-mono text-[13px] tracking-wide text-text-tertiary uppercase">
                    {group.questions[0].type === "code" ? "Program" : "Problem"} · questions{" "}
                    {numbering.get(group.questions[0].id)}–
                    {numbering.get(group.questions[group.questions.length - 1].id)}
                  </p>
                  {group.title && (
                    <h2 className="mt-1 text-[17px] font-semibold text-text-primary">
                      {group.title}
                    </h2>
                  )}
                  <StimulusBlock stimulus={group.stimulus} />
                </div>
              )}

              {group.questions.map((question) => {
                const selected = answers[question.id];
                const isAnswered = selected !== undefined;
                const isUnsure = unsureIds.includes(question.id);
                const revealAnswer =
                  showFeedback && isAnswered && selected !== question.correctIndex;

                return (
                  <div
                    key={question.id}
                    id={`question-${question.id}`}
                    className={`scroll-mt-6 py-6 ${group.stimulus ? "border-t border-border" : ""}`}
                  >
                <div className="flex items-baseline justify-between gap-6">
                  <span className="font-mono text-[14px] font-bold tracking-wide text-text-primary">
                    {numbering.get(question.id)} of {questions.length}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => clearSelection(question.id)}
                      disabled={!isAnswered}
                      title={isAnswered ? undefined : "No answer selected yet"}
                      className="rounded-lg border border-border px-2.5 py-1 text-[14px] font-medium text-text-secondary enabled:hover:border-border-strong enabled:hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Clear selection
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleUnsure(question.id)}
                      aria-pressed={isUnsure}
                      className={`rounded-lg border px-2.5 py-1 text-[14px] font-medium ${
                        isUnsure
                          ? "border-error bg-error-subtle text-error"
                          : "border-border text-text-secondary hover:border-border-strong hover:text-text-primary"
                      }`}
                    >
                      {isUnsure ? "Marked unsure" : "Mark as unsure"}
                    </button>
                  </div>
                </div>

                <p
                  className={`mt-2 text-[16px] leading-relaxed whitespace-pre-wrap text-text-primary ${
                    // A set's table/listing lives in the stimulus above, so the
                    // question itself is plain prose. Only the older standalone
                    // Timeline/Code questions carry their own preformatted text.
                    isPreformatted(question.type) && !group.stimulus ? "font-mono text-[15px]" : ""
                  }`}
                >
                  {question.question}
                </p>

                <div className="mt-4 flex flex-col gap-2">
                  {question.options.map((option, optionIndex) => {
                    const isSelected = selected === optionIndex;
                    const isCorrectOption = optionIndex === question.correctIndex;

                    // Only ever styled in immediate mode: the picked option is
                    // marked right/wrong, and a wrong pick also points at the
                    // correct one so the question is actually worth something.
                    let stateClass = "border-border hover:border-border-strong";
                    if (showFeedback && isSelected) {
                      stateClass = isCorrectOption
                        ? "border-success bg-success-subtle"
                        : "border-error bg-error-subtle";
                    } else if (revealAnswer && isCorrectOption) {
                      stateClass = "border-success bg-success-subtle";
                    } else if (isSelected) {
                      stateClass = "border-accent bg-accent-subtle";
                    }

                    return (
                      <label
                        key={optionIndex}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-2.5 ${stateClass}`}
                      >
                        <input
                          type="radio"
                          name={`q-${question.id}`}
                          checked={isSelected}
                          onChange={() => selectOption(question.id, optionIndex)}
                          className="mt-1 accent-accent"
                        />
                        <span
                          className={`text-text-primary ${
                            question.type === "code" ? "font-mono text-[14px]" : "text-[15px]"
                          }`}
                        >
                          <span className="font-mono text-[13px] text-text-tertiary">
                            {optionLetter(optionIndex)}.
                          </span>{" "}
                          {option}
                        </span>
                        {showFeedback && isSelected && (
                          <span
                            className={`ml-auto shrink-0 self-center text-[14px] font-medium ${
                              isCorrectOption ? "text-success" : "text-error"
                            }`}
                          >
                            {isCorrectOption ? "Correct" : "Incorrect"}
                          </span>
                        )}
                        {revealAnswer && !isSelected && isCorrectOption && (
                          <span className="ml-auto shrink-0 self-center text-[14px] font-medium text-success">
                            Correct answer
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          className="mt-8 rounded-lg bg-accent px-4 py-2.5 text-[15px] font-medium text-white hover:bg-accent-hover"
        >
          Submit quiz
        </button>
      </div>

      <aside className="sticky top-6 hidden h-fit w-56 shrink-0 lg:block">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[14px] text-text-secondary">
            {answeredCount} of {questions.length} answered
          </p>
          <button
            type="button"
            onClick={() => setConfirmCancelOpen(true)}
            className="shrink-0 rounded-lg border border-error px-2.5 py-1 text-[14px] font-medium text-error hover:bg-error-subtle"
          >
            Cancel quiz
          </button>
        </div>

        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {questions.map((question, index) => {
            const isAnswered = answers[question.id] !== undefined;
            const isCorrect = answers[question.id] === question.correctIndex;
            const isUnsure = unsureIds.includes(question.id);
            const isActive = question.id === activeId;

            // Fill carries status; the ring carries position, so the two never
            // have to compete for the same visual channel. Correctness only
            // shows in immediate mode — end-only keeps a neutral "answered"
            // fill, since revealing right/wrong here would defeat the mode.
            let stateClass = "border-border bg-surface text-text-secondary";
            if (isUnsure) stateClass = "border-warning bg-warning-subtle text-warning";
            else if (isAnswered) {
              stateClass = showFeedback
                ? isCorrect
                  ? "border-success bg-success-subtle text-success"
                  : "border-error bg-error-subtle text-error"
                : "border-border-strong bg-surface-alt text-text-primary";
            }

            const answeredState = showFeedback
              ? isCorrect
                ? "Correct"
                : "Incorrect"
              : "Answered";
            const state = isUnsure
              ? isAnswered
                ? `${answeredState}, marked unsure`
                : "Unanswered, marked unsure"
              : isAnswered
                ? answeredState
                : "Unanswered";

            return (
              <button
                key={question.id}
                onClick={() => jumpTo(question.id)}
                title={`Question ${index + 1} — ${state}${isActive ? ", currently viewing" : ""}`}
                aria-current={isActive ? "true" : undefined}
                className={`rounded border py-1 font-mono text-[13px] ${stateClass} ${
                  isActive ? "ring-2 ring-text-secondary ring-offset-1" : ""
                }`}
              >
                {index + 1}
              </button>
            );
          })}
        </div>

        <div className="mt-4 border-t border-border pt-3">
          <p className="text-[13px] font-medium text-text-primary">Legend</p>
          <dl className="mt-2 flex flex-col gap-1.5 text-[13px] text-text-secondary">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-sm border border-border bg-surface" />
              <dd>Unanswered</dd>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-sm border border-warning bg-warning-subtle" />
              <dd>Marked unsure</dd>
            </div>
            {showFeedback ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-sm border border-success bg-success-subtle" />
                  <dd>Correct</dd>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-sm border border-error bg-error-subtle" />
                  <dd>Incorrect</dd>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-sm border border-border-strong bg-surface-alt" />
                <dd>Answered</dd>
              </div>
            )}
          </dl>
        </div>
      </aside>

      {confirmCancelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-menu">
            <h2 className="text-[19px] font-semibold text-text-primary">Cancel this quiz?</h2>
            <p className="mt-2 text-[15px] text-text-secondary">
              Your progress will be lost. Nothing is saved to your attempts.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmCancelOpen(false)}
                className="rounded-lg px-4 py-2 text-[15px] font-medium text-text-secondary hover:bg-surface-alt"
              >
                Keep working
              </button>
              <button
                onClick={onCancel}
                className="rounded-lg bg-error px-4 py-2 text-[15px] font-medium text-white hover:opacity-90"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-menu">
            <h2 className="text-[19px] font-semibold text-text-primary">Submit with blanks?</h2>
            <p className="mt-2 text-[15px] text-text-secondary">
              {unansweredCount} question{unansweredCount === 1 ? " is" : "s are"} still unanswered.
              Unanswered questions count as incorrect.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg px-4 py-2 text-[15px] font-medium text-text-secondary hover:bg-surface-alt"
              >
                Keep working
              </button>
              <button
                onClick={() => onSubmit(answers, unsureIds)}
                className="rounded-lg bg-accent px-4 py-2 text-[15px] font-medium text-white hover:bg-accent-hover"
              >
                Submit anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
