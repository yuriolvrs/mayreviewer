"use client";

import { useState } from "react";
import {
  QUESTION_TYPES,
  TYPE_LABELS,
  formatTakenAt,
  isPreformatted,
  sampleProportionally,
  scoreTone,
} from "@/app/lib/questions";
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

function ChevronRightIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M4 2l3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// How this attempt moved against the one before it. Compared in percent rather
// than raw score, since attempts can be run at different question counts.
function Delta({ change }: { change: number }) {
  const [arrow, tone, label] =
    change > 0
      ? ["↑", "text-success", "up"]
      : change < 0
        ? ["↓", "text-error", "down"]
        : ["–", "text-text-tertiary", "unchanged"];

  return (
    <span
      className={`text-[14px] ${tone}`}
      title={`${Math.abs(change)}% ${label} from the previous attempt`}
    >
      {arrow} {Math.abs(change)}%
    </span>
  );
}

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
  onViewAttempt,
}: {
  reviewer: Reviewer;
  history: QuizAttempt[];
  feedbackMode: FeedbackMode;
  onFeedbackModeChange: (mode: FeedbackMode) => void;
  onStart: (questions: Question[]) => void;
  onViewAttempt: (attempt: QuizAttempt) => void;
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
            {/* History is newest-first, so an attempt's predecessor is the row
                below it — and the last row has none to compare against. */}
            {history.map((attempt, index) => {
              const percent = Math.round((attempt.score / attempt.total) * 100);
              const previous = history[index + 1];
              const summary = (
                <>
                  <span className="text-text-secondary">{formatTakenAt(attempt.takenAt)}</span>
                  {/* Delta and score travel together on the right, so the
                      comparison reads against the number it qualifies. */}
                  <span className="ml-auto flex items-center gap-3">
                    {previous && (
                      <Delta
                        change={percent - Math.round((previous.score / previous.total) * 100)}
                      />
                    )}
                    <span className={`font-medium ${scoreTone(percent)}`}>
                      {attempt.score}/{attempt.total} ({percent}%)
                    </span>
                  </span>
                </>
              );

              // Attempts recorded before answers were kept have nothing to
              // reopen. Rendered as the same disabled <button> rather than a
              // plain <div> — a second element with its own box model here
              // previously threw off the horizontal alignment between
              // reopenable and non-reopenable rows.
              const reopenable = attempt.questions.length > 0;
              return (
                <li key={attempt.id} className="border-t border-border last:border-b">
                  <button
                    type="button"
                    disabled={!reopenable}
                    onClick={() => onViewAttempt(attempt)}
                    title={reopenable ? "View these results" : undefined}
                    // No -mx-N to bleed past: unlike the auto-width buttons
                    // elsewhere in the app, this row is already full-width, so
                    // negative margin here only shrank the hover fill instead
                    // of extending it — plain padding is the whole row.
                    className={`flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left text-[15px] ${
                      reopenable ? "group hover:bg-surface-alt" : ""
                    }`}
                  >
                    {summary}
                    {/* Slot stays a fixed w-4 whether or not the chevron
                        renders, so the score column never shifts. */}
                    <span
                      className={`w-4 shrink-0 text-text-tertiary ${
                        reopenable ? "group-hover:text-text-primary" : ""
                      }`}
                    >
                      {reopenable && <ChevronRightIcon />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
