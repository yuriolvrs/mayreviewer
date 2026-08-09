"use client";

import { useState } from "react";
import { QUESTION_TYPES, TYPE_LABELS, isPreformatted, sampleProportionally } from "@/app/lib/questions";
import type { FeedbackMode, Question, QuestionType, QuizAttempt, Reviewer } from "@/app/types";

const FEEDBACK_OPTIONS: { value: FeedbackMode; label: string; hint: string }[] = [
  {
    value: "immediate",
    label: "Show correct/incorrect immediately",
    hint: "Feedback appears as you answer. You can still change an answer afterward.",
  },
  {
    value: "end-only",
    label: "Only show results at the end",
    hint: "Nothing is revealed until you submit.",
  },
];

// Timeline and Code questions mean tracing a table or reading a listing, so
// they cost noticeably more than answering a definition.
const SECONDS_PER_QUESTION = 30;
const SECONDS_PER_PREFORMATTED_QUESTION = 60;

function estimatedMinutes(pool: Question[], count: number): number {
  if (pool.length === 0 || count === 0) return 0;
  const averageSeconds =
    pool.reduce(
      (sum, q) => sum + (isPreformatted(q.type) ? SECONDS_PER_PREFORMATTED_QUESTION : SECONDS_PER_QUESTION),
      0,
    ) / pool.length;
  return Math.max(1, Math.round((averageSeconds * count) / 60));
}

export default function QuizSetup({
  reviewer,
  history,
  feedbackMode,
  onFeedbackModeChange,
  onStart,
}: {
  reviewer: Reviewer;
  history: QuizAttempt[];
  feedbackMode: FeedbackMode;
  onFeedbackModeChange: (mode: FeedbackMode) => void;
  onStart: (questions: Question[]) => void;
}) {
  // Empty means "all" — the chip row shows that as the All types chip.
  const [scopeTypes, setScopeTypes] = useState<QuestionType[]>([]);
  const [countInput, setCountInput] = useState(String(reviewer.questions.length));

  function poolFor(types: QuestionType[]): Question[] {
    return types.length === 0
      ? reviewer.questions
      : reviewer.questions.filter((q) => types.includes(q.type));
  }

  const pool = poolFor(scopeTypes);
  const available = pool.length;
  const requested = parseInt(countInput, 10);
  const count = Math.min(Math.max(Number.isNaN(requested) ? available : requested, 1), available);
  const overAsked = Number.isInteger(requested) && requested > available;

  // Changing scope resets the count to the new scope's full size, so the field
  // never sits on a number the new pool can't satisfy.
  function applyScope(types: QuestionType[]) {
    setScopeTypes(types);
    setCountInput(String(poolFor(types).length));
  }

  function toggleType(type: QuestionType) {
    const next = scopeTypes.includes(type)
      ? scopeTypes.filter((t) => t !== type)
      : [...scopeTypes, type];
    // Deselecting the last one lands back on "all" rather than an empty quiz.
    applyScope(next);
  }

  const typesPresent = QUESTION_TYPES.filter((t) => reviewer.questions.some((q) => q.type === t));
  const minutes = estimatedMinutes(pool, count);

  return (
    <>
      <div className="mt-8 border-t border-border pt-6">
        <h2 className="text-[15px] font-semibold text-text-primary">Scope</h2>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => applyScope([])}
            className={`rounded-lg px-2.5 py-1 text-[14px] font-medium ${
              scopeTypes.length === 0
                ? "bg-accent text-white"
                : "border border-border-strong text-text-secondary hover:text-text-primary"
            }`}
          >
            All types
          </button>
          {typesPresent.map((type) => (
            <button
              key={type}
              onClick={() => toggleType(type)}
              aria-pressed={scopeTypes.includes(type)}
              className={`rounded-lg px-2.5 py-1 text-[14px] font-medium ${
                scopeTypes.includes(type)
                  ? "bg-accent text-white"
                  : "border border-border-strong text-text-secondary hover:text-text-primary"
              }`}
            >
              {TYPE_LABELS[type]}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="text-[15px] text-text-secondary">Number of questions</span>
            <input
              type="number"
              min={1}
              max={available}
              value={countInput}
              onChange={(e) => setCountInput(e.target.value)}
              onBlur={() => setCountInput(String(count))}
              className="h-10 w-20 rounded-lg border border-border bg-surface px-2 text-[15px] text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
          <span className="text-[14px] text-text-tertiary">~{minutes} min estimated</span>
        </div>

        {overAsked && (
          <p className="mt-2 text-[14px] text-text-secondary">
            Only {available} question{available === 1 ? " is" : "s are"} available in this scope —
            the quiz will use {count}.
          </p>
        )}
        {count < available && !overAsked && (
          <p className="mt-2 text-[14px] text-text-tertiary">
            Sampled evenly across the question types in this scope, and reshuffled each attempt.
          </p>
        )}
      </div>

      <div className="mt-8 border-t border-border pt-6">
        <h2 className="text-[15px] font-semibold text-text-primary">Feedback mode</h2>
        <div className="mt-3 flex flex-col gap-3">
          {FEEDBACK_OPTIONS.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-start gap-3">
              <input
                type="radio"
                name="feedback-mode"
                checked={feedbackMode === option.value}
                onChange={() => onFeedbackModeChange(option.value)}
                className="mt-1 cursor-pointer accent-accent"
              />
              <span>
                <span className="block text-[15px] leading-tight font-semibold text-text-primary">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[14px] leading-snug text-text-secondary">
                  {option.hint}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={() => onStart(sampleProportionally(pool, count))}
          disabled={available === 0}
          title={available === 0 ? "No questions in this scope" : undefined}
          className="rounded-lg bg-accent px-4 py-2.5 text-[15px] font-medium text-white enabled:hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Start quiz
        </button>
      </div>

      <div className="mt-10 border-t border-border pt-6">
        <h2 className="text-[15px] font-semibold text-text-primary">Your attempts</h2>
        {history.length === 0 ? (
          <p className="mt-2 text-[15px] text-text-secondary">
            No attempts yet. Your scores for this reviewer will show up here.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col">
            {history.map((attempt) => (
              <li
                key={attempt.id}
                className="flex items-center justify-between border-t border-border py-3 text-[15px] last:border-b"
              >
                <span className="text-text-secondary">
                  {new Date(attempt.takenAt).toLocaleString()}
                </span>
                <span className="text-text-primary">
                  {attempt.score}/{attempt.total} (
                  {Math.round((attempt.score / attempt.total) * 100)}%)
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
