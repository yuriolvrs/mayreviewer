"use client";

import { useState } from "react";
import {
  missedIds,
  paceCalibrationFactor,
  sampleProportionally,
  SET_QUESTION_SECONDS,
  STANDALONE_QUESTION_SECONDS,
} from "@/app/lib/questions";
import { isMonoKind, formatTypeKeys, resolveFromList, stimulusKindOf, typeLabelOf } from "@/app/lib/examFormats";
import { useFormats } from "@/app/lib/useFormats";
import type { ExamFormat } from "@/app/lib/examFormats";
import type { FeedbackMode, Question, QuizAttempt, Reviewer } from "@/app/types";

const FEEDBACK_OPTIONS: { value: FeedbackMode; label: string; hint: string }[] = [
  {
    value: "immediate",
    label: "Show correct/incorrect immediately",
    hint: "Feedback appears as you answer. Confirm locks the answer; explanations show immediately.",
  },
  {
    value: "end-only",
    label: "Only show results at the end",
    hint: "Nothing is revealed until you submit.",
  },
];

// Timeline and Code questions mean tracing a table or reading a listing, so
// they cost noticeably more than answering a definition. Cold-start only —
// once enough attempts exist the estimate calibrates to the user's own pace.
const SECONDS_PER_QUESTION = STANDALONE_QUESTION_SECONDS;
const SECONDS_PER_PREFORMATTED_QUESTION = SET_QUESTION_SECONDS;

// User-typed timer bounds (minutes). The countdown itself runs in seconds.
const MIN_TIMER_MINUTES = 1;
const MAX_TIMER_MINUTES = 180;
const DEFAULT_TIMER_MINUTES = 10;
// One-tap budgets covering a quick drill through an exam-length sitting.
const TIMER_PRESETS = [5, 10, 15, 30, 60];

function questionCostSeconds(format: ExamFormat, question: Question): number {
  return isMonoKind(stimulusKindOf(format, question.type))
    ? SECONDS_PER_PREFORMATTED_QUESTION
    : SECONDS_PER_QUESTION;
}

function estimatedMinutes(
  format: ExamFormat,
  pool: Question[],
  count: number,
  paceFactor: number = 1,
): number {
  if (pool.length === 0 || count === 0) return 0;
  const averageSeconds =
    pool.reduce((sum, q) => sum + questionCostSeconds(format, q), 0) / pool.length;
  return Math.max(1, Math.round(((averageSeconds * count) / 60) * paceFactor));
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
  onStart: (questions: Question[], opts: { timeLimitSec: number | null; parSec: number }) => void;
}) {
  // Empty means "all" — the chip row shows that as the All types chip.
  const [scopeTypes, setScopeTypes] = useState<string[]>([]);
  const [missedOnly, setMissedOnly] = useState(false);
  const [countInput, setCountInput] = useState(String(reviewer.questions.length));
  const [timed, setTimed] = useState(false);
  const [minutesInput, setMinutesInput] = useState(String(DEFAULT_TIMER_MINUTES));

  function poolFor(types: string[]): Question[] {
    return types.length === 0
      ? reviewer.questions
      : reviewer.questions.filter((q) => types.includes(q.type));
  }

  // Ids survive question edits, so the newest attempt's misses still match the
  // current pool; questions deleted since simply fall out of the scope.
  const missed = new Set(
    history.length > 0 ? missedIds(history[0].questions, history[0].answers) : [],
  );

  const pool = poolFor(scopeTypes).filter((q) => !missedOnly || missed.has(q.id));
  const available = pool.length;
  const requested = parseInt(countInput, 10);
  const count = Math.min(Math.max(Number.isNaN(requested) ? available : requested, 1), available);
  const overAsked = Number.isInteger(requested) && requested > available;

  // Changing scope resets the count to the new scope's full size, so the field
  // never sits on a number the new pool can't satisfy.
  function applyScope(types: string[]) {
    setScopeTypes(types);
    const base = poolFor(types);
    setCountInput(String(missedOnly ? base.filter((q) => missed.has(q.id)).length : base.length));
  }

  function toggleMissed() {
    const next = !missedOnly;
    setMissedOnly(next);
    const base = poolFor(scopeTypes);
    setCountInput(String(next ? base.filter((q) => missed.has(q.id)).length : base.length));
  }

  function toggleType(type: string) {
    const next = scopeTypes.includes(type)
      ? scopeTypes.filter((t) => t !== type)
      : [...scopeTypes, type];
    // Deselecting the last one lands back on "all" rather than an empty quiz.
    applyScope(next);
  }

  // Scope chips follow the reviewer's format order, showing only types the
  // pool actually contains.
  const formats = useFormats();
  const format = resolveFromList(formats, reviewer.examFormatId);
  const typesPresent = formatTypeKeys(format).filter((t) =>
    reviewer.questions.some((q) => q.type === t),
  );
  // The user's own pace, once enough attempts exist — the same cost
  // classifier as the estimate, so prediction and estimate stay consistent.
  const paceFactor = paceCalibrationFactor(history, (q) => questionCostSeconds(format, q));
  const minutes = estimatedMinutes(format, pool, count, paceFactor ?? 1);

  // Clamped the same way as the count above: garbage in, sane number out.
  const parsedMinutes = parseInt(minutesInput, 10);
  const timeMinutes = Math.min(
    Math.max(Number.isNaN(parsedMinutes) ? DEFAULT_TIMER_MINUTES : parsedMinutes, MIN_TIMER_MINUTES),
    MAX_TIMER_MINUTES,
  );

  return (
    // Single element, not a fragment: the quiz page puts this beside the
    // attempts rail in a grid, and fragment children would each become
    // their own grid item. min-w-0 keeps long chip rows from blowing out
    // the main column.
    <div className="min-w-0">
      <div className="mt-8 border-t border-border pt-6">
        <h2 className="text-[15px] font-semibold text-text-primary">Scope</h2>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => applyScope([])}
            aria-pressed={scopeTypes.length === 0}
            className={`rounded-lg px-2.5 py-1 text-[14px] font-medium ${
              scopeTypes.length === 0
                ? "bg-accent text-on-accent"
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
                  ? "bg-accent text-on-accent"
                  : "border border-border-strong text-text-secondary hover:text-text-primary"
              }`}
            >
              {typeLabelOf(format, type)}
            </button>
          ))}
          {missed.size > 0 && (
            <button
              onClick={toggleMissed}
              aria-pressed={missedOnly}
              title="Only questions the newest attempt got wrong or left blank"
              className={`rounded-lg px-2.5 py-1 text-[14px] font-medium ${
                missedOnly
                  ? "bg-accent text-on-accent"
                  : "border border-border-strong text-text-secondary hover:text-text-primary"
              }`}
            >
              Missed last time ({missed.size})
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="text-[15px] text-text-secondary">Number of questions</span>
            <input
              type="number"
              min={1}
              max={available}
              inputMode="numeric"
              value={countInput}
              onChange={(e) => setCountInput(e.target.value)}
              onBlur={() => setCountInput(String(count))}
              aria-describedby={overAsked ? "quiz-count-note" : undefined}
              className="h-10 w-20 rounded-lg border border-border bg-surface px-2 text-[15px] text-text-primary outline-none focus:border-accent"
            />
          </label>
          <span className="text-[14px] text-text-tertiary">~{minutes} min estimated</span>
        </div>

        {overAsked && (
          <p id="quiz-count-note" className="mt-2 text-[14px] text-text-secondary">
            Only {available} question{available === 1 ? " is" : "s are"} available in this scope —
            the quiz will use {count}.
          </p>
        )}
        {missedOnly && available === 0 && (
          <p className="mt-2 text-[14px] text-text-secondary">
            Those questions are no longer in the pool — turn the filter off for the full set.
          </p>
        )}
        {count < available && !overAsked && (
          <p className="mt-2 text-[14px] text-text-tertiary">
            Sampled evenly across the question types in this scope, and reshuffled each attempt.
          </p>
        )}
      </div>

      <div className="mt-6 border-t border-border pt-4">
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

      <div className="mt-6 border-t border-border pt-4">
        <h2 className="text-[15px] font-semibold text-text-primary">Timer</h2>
        <p className="mt-1 text-[14px] leading-snug text-text-secondary">
          Countdown while answering; submits automatically at zero.
        </p>
        {/* One control for one decision: Off or a duration. Picking any
            duration turns the timer on, so there is no separate toggle to
            keep in sync — same chip language as Scope above. */}
        <div
          className="mt-3 flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Timer duration"
        >
          <button
            type="button"
            onClick={() => setTimed(false)}
            aria-pressed={!timed}
            className={`rounded-lg px-2.5 py-1 text-[14px] font-medium ${
              !timed
                ? "bg-accent text-on-accent"
                : "border border-border-strong text-text-secondary hover:text-text-primary"
            }`}
          >
            Off
          </button>
          {TIMER_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setTimed(true);
                setMinutesInput(String(preset));
              }}
              aria-pressed={timed && timeMinutes === preset}
              className={`rounded-lg px-2.5 py-1 text-[14px] font-medium ${
                timed && timeMinutes === preset
                  ? "bg-accent text-on-accent"
                  : "border border-border-strong text-text-secondary hover:text-text-primary"
              }`}
            >
              {preset} min
            </button>
          ))}
          {/* The estimate already shown by the question count, offered as a
              budget — but only when it isn't one of the presets already. */}
          {minutes > 0 && !TIMER_PRESETS.includes(minutes) && (
            <button
              type="button"
              onClick={() => {
                setTimed(true);
                setMinutesInput(String(minutes));
              }}
              aria-pressed={timed && timeMinutes === minutes}
              title={
                paceFactor === null
                  ? "Matches the estimated time for this quiz"
                  : "Matches your average pace for this quiz"
              }
              className={`rounded-lg px-2.5 py-1 text-[14px] font-medium ${
                timed && timeMinutes === minutes
                  ? "bg-accent text-on-accent"
                  : "border border-border-strong text-text-secondary hover:text-text-primary"
              }`}
            >
              Suggested ~{minutes}
            </button>
          )}
        </div>
        {timed && (
          <label className="mt-3 flex items-center gap-2">
            <span className="text-[15px] text-text-secondary">Custom minutes</span>
            <input
              type="number"
              min={MIN_TIMER_MINUTES}
              max={MAX_TIMER_MINUTES}
              inputMode="numeric"
              value={minutesInput}
              onChange={(e) => setMinutesInput(e.target.value)}
              onBlur={() => setMinutesInput(String(timeMinutes))}
              aria-label="Time limit in minutes"
              className="h-10 w-20 rounded-lg border border-border bg-surface px-2 text-[15px] text-text-primary outline-none focus:border-accent"
            />
          </label>
        )}
      </div>

      <div className="mt-4 flex justify-center">
        <button
          onClick={() => onStart(sampleProportionally(pool, count), { timeLimitSec: timed ? timeMinutes * 60 : null, parSec: minutes * 60 })}
          disabled={available === 0}
          title={available === 0 ? "No questions in this scope" : undefined}
          className="rounded-lg bg-accent px-4 py-2.5 text-[15px] font-medium text-on-accent enabled:hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Start quiz
        </button>
      </div>
    </div>
  );
}
