"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import {
  MAX_SHORT_ANSWER_CHARS,
  formatCountdown,
  groupQuestions,
  isAnswered as isQuestionAnswered,
  isLowTime,
  isPreformatted,
  isShortAnswer,
  optionLetter,
} from "@/app/lib/questions";
import { saveQuizProgress } from "@/app/lib/quizProgress";
import { isMonoKind, stimulusKindOf, type ExamFormat } from "@/app/lib/examFormats";
import StimulusBlock from "@/app/components/StimulusBlock";
import StimulusQuote from "@/app/components/StimulusQuote";
import type { FeedbackMode, Question } from "@/app/types";

export type Answers = Record<string, number>;

// History entries this module has pushed as back-button guards since the user
// last left the quiz. Mounting twice (cancel, then restart) stacks two, and
// leaving by Back has to step past all of them.
let guardEntries = 0;

export default function QuizTaking({
  questions,
  format,
  feedbackMode,
  timeLimitSec,
  parSec,
  reviewerId,
  formatId,
  startedAt,
  initialAnswers,
  initialTextAnswers,
  initialUnsureIds,
  initialConfirmedIds,
  onSubmit,
  onCancel,
}: {
  questions: Question[];
  // The format the attempt is taken under: problem-block and option-mono
  // rules read stimulus kinds from it rather than matching type names.
  format: ExamFormat;
  feedbackMode: FeedbackMode;
  // Countdown budget picked in Quiz Setup, or null for untimed. Elapsed time
  // is recorded either way — the limit only adds the display + auto-submit.
  timeLimitSec: number | null;
  // Pace estimate for these questions, in seconds — written through to the
  // snapshot alongside everything else so a refresh never loses it. 0 means
  // unknown and records as such at submit.
  parSec: number;
  // Persistence identity: every answer/unsure/confirm change is written
  // through to the in-progress snapshot for this reviewer.
  reviewerId: string;
  formatId: string | null;
  // Wall-clock start (Date.now() epoch ms). Fresh attempts leave it
  // undefined and stamp now on mount; restores after a refresh pass the
  // saved value so the countdown continues instead of restarting.
  startedAt?: number;
  initialAnswers?: Answers;
  // Typed short answers restored after a refresh, keyed by question id.
  initialTextAnswers?: Record<string, string>;
  initialUnsureIds?: string[];
  initialConfirmedIds?: string[];
  onSubmit: (
    answers: Answers,
    unsureIds: string[],
    timing: { durationSec: number; timedOut: boolean },
    textAnswers: Record<string, string>,
  ) => void;
  onCancel: () => void;
}) {
  const [answers, setAnswers] = useState<Answers>(() => initialAnswers ?? {});
  // Short answers are typed text, so they sit beside the option picks rather
  // than inside them. Blank entries are kept; "answered" trims.
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>(
    () => initialTextAnswers ?? {},
  );
  const [unsureIds, setUnsureIds] = useState<string[]>(() => initialUnsureIds ?? []);
  // Immediate mode only: an option pick is provisional until confirmed, so
  // right/wrong doesn't flash before the reader has committed to it.
  // Restored after a refresh so locked answers stay locked.
  const [confirmedIds, setConfirmedIds] = useState<string[]>(() => initialConfirmedIds ?? []);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  // Where a blocked in-app exit was headed; "back" is the browser Back button.
  const [leaveTarget, setLeaveTarget] = useState<string | null>(null);
  const router = useRouter();
  const leavingRef = useRef(false);
  const visibleIds = useRef(new Set<string>());

  // Wall-clock start: remaining time derives from Date.now() rather than
  // tick counts, so a backgrounded tab (throttled intervals) still counts
  // its hidden minutes. The value is the persisted attempt start, so a
  // refresh resumes the same clock instead of restarting it.
  const [resolvedStartedAt] = useState(() => startedAt ?? Date.now());
  const [now, setNow] = useState(() => Date.now());
  // Latest answers for the expiry submit, which fires from an interval
  // closure that would otherwise hold the first render's empty copies.
  const answersRef = useRef(answers);
  const textRef = useRef(textAnswers);
  const unsureRef = useRef(unsureIds);
  // Expiry submits exactly once; the stage switch unmounts right after, but
  // the guard covers the tick between submit and unmount.
  const expiredRef = useRef(false);
  useEffect(() => {
    answersRef.current = answers;
    textRef.current = textAnswers;
    unsureRef.current = unsureIds;
  });

  // Write-through persistence: every change lands in localStorage, so a
  // refresh restores answers, unsure flags, and confirm locks. Runs on mount
  // too, which records the entry for quizzes refreshed before answering.
  useEffect(() => {
    saveQuizProgress({
      reviewerId,
      quizQuestions: questions,
      answers,
      textAnswers,
      unsureIds,
      confirmedIds,
      timeLimitSec,
      parSec,
      startedAt: resolvedStartedAt,
      formatId,
      feedbackMode,
      savedAt: Date.now(),
    });
  }, [
    reviewerId,
    questions,
    answers,
    textAnswers,
    unsureIds,
    confirmedIds,
    timeLimitSec,
    parSec,
    resolvedStartedAt,
    formatId,
    feedbackMode,
  ]);

  const elapsedSec = Math.floor((now - resolvedStartedAt) / 1000);
  const remainingSec = timeLimitSec === null ? null : timeLimitSec - elapsedSec;
  // Red for the last 10% of the budget, not a fixed cutoff — a 60-minute
  // quiz deserves an earlier warning than a 2-minute one.
  const lowTime = remainingSec !== null && timeLimitSec !== null && isLowTime(remainingSec, timeLimitSec);

  // Display ticks only when there's a countdown to show; elapsed time for
  // untimed quizzes is computed from the start ref at submit.
  useEffect(() => {
    if (timeLimitSec === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [timeLimitSec]);

  // Timeout force-submits with whatever is answered — blanks score wrong like
  // any unanswered question would on manual submit. Bypasses the
  // unanswered-confirm dialog: there is nothing left to deliberate.
  useEffect(() => {
    if (remainingSec === null || remainingSec > 0 || expiredRef.current) return;
    expiredRef.current = true;
    const elapsed = Math.round((Date.now() - resolvedStartedAt) / 1000);
    onSubmit(answersRef.current, unsureRef.current, { durationSec: elapsed, timedOut: true }, textRef.current);
  }, [remainingSec, resolvedStartedAt, onSubmit]);

  // Timeline/Code questions arrive as contiguous sets over one shared problem;
  // the problem is rendered once at the head of the set. Numbering stays global
  // so it keeps matching the jump-to grid in the sidebar.
  const groups = useMemo(() => groupQuestions(questions), [questions]);
  const numbering = useMemo(
    () => new Map(questions.map((q, i) => [q.id, i + 1])),
    [questions],
  );

  const answeredCount = questions.filter((q) => isQuestionAnswered(q, answers, textAnswers)).length;
  const unansweredCount = questions.length - answeredCount;
  const showFeedback = feedbackMode === "immediate";

  // Reloads restore from the persisted snapshot, but the confirm dialogs
  // only guard in-app buttons — keep the tab-close guard for accidental
  // navigation away from unsubmitted answers.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      const typed = Object.values(textAnswers).some((text) => text.trim() !== "");
      if (Object.keys(answers).length > 0 || typed) e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [answers, textAnswers]);

  // The quiz is a focused task: hide the phone tab bar (CSS keys off this
  // attribute) and put every other way out behind a confirm. Answers persist,
  // so leaving is safe, but it should never happen by accident.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.quiz = "active";
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveTarget(url.pathname + url.search + url.hash);
    }
    function onPopState() {
      if (leavingRef.current) return;
      // Re-arm the guard so the dialog can answer, then ask.
      window.history.pushState(window.history.state, "");
      setLeaveTarget("back");
    }
    window.history.pushState(window.history.state, "");
    guardEntries += 1;
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      delete root.dataset.quiz;
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  function confirmLeave() {
    const target = leaveTarget;
    setLeaveTarget(null);
    if (target === "back") {
      // Past every guard entry and the quiz entry itself.
      leavingRef.current = true;
      const steps = guardEntries + 1;
      guardEntries = 0;
      window.history.go(-steps);
    } else if (target) {
      guardEntries = 0;
      router.push(target);
    }
  }

  // Stable callbacks: the keyboard-shortcuts effect lists them as deps, so
  // they must not change identity every render.
  const selectOption = useCallback(
    (questionId: string, optionIndex: number) => {
      if (confirmedIds.includes(questionId)) return;
      setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
    },
    [confirmedIds],
  );

  const setText = useCallback((questionId: string, value: string) => {
    setTextAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const toggleUnsure = useCallback((questionId: string) => {
    setUnsureIds((prev) =>
      prev.includes(questionId) ? prev.filter((id) => id !== questionId) : [...prev, questionId],
    );
  }, []);

  const jumpTo = useCallback((questionId: string) => {
    setJumpOpen(false);
    document.getElementById(`question-${questionId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  // Keyboard shortcuts: 1–4 answer the question in view, u flags it unsure,
  // n/p move between questions. Ignored while typing or with modifiers held.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input,textarea,select") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!activeId || confirmOpen || confirmCancelOpen) return;
      const question = questions.find((q) => q.id === activeId);
      if (!question) return;
      if (e.key >= "1" && e.key <= "9") {
        const index = Number(e.key) - 1;
        if (index < question.options.length && !confirmedIds.includes(activeId)) {
          e.preventDefault();
          selectOption(activeId, index);
        }
      } else if (e.key === "u") {
        e.preventDefault();
        toggleUnsure(activeId);
      } else if (e.key === "n" || e.key === "p") {
        e.preventDefault();
        const ids = questions.map((q) => q.id);
        const at = ids.indexOf(activeId);
        const next = e.key === "n" ? ids[Math.min(at + 1, ids.length - 1)] : ids[Math.max(at - 1, 0)];
        jumpTo(next);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, questions, confirmedIds, confirmOpen, confirmCancelOpen, selectOption, toggleUnsure, jumpTo]);

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

  function clearSelection(questionId: string) {
    if (confirmedIds.includes(questionId)) return;
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
    setTextAnswers((prev) => {
      if (!(questionId in prev)) return prev;
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  }

  function confirmAnswer(questionId: string) {
    setConfirmedIds((prev) => (prev.includes(questionId) ? prev : [...prev, questionId]));
  }

  function handleSubmit() {
    if (unansweredCount > 0) {
      setConfirmOpen(true);
      return;
    }
    const elapsed = Math.round((Date.now() - resolvedStartedAt) / 1000);
    onSubmit(answers, unsureIds, { durationSec: elapsed, timedOut: false }, textAnswers);
  }

  // The grid and its legend are the same on both layouts — the sidebar can't
  // fit beside the questions on a phone, so below `lg` the identical markup is
  // served from a bottom sheet above them instead of being dropped.
  const jumpGrid = (
    <div className="grid grid-cols-5 gap-1.5">
      {questions.map((question, index) => {
        const isAnswered = isQuestionAnswered(question, answers, textAnswers);
        // A short answer has no verdict until it is graded at submit, so the
        // grid never shows it as right or wrong while the quiz is running.
        const isShort = isShortAnswer(question);
        const isCorrect = !isShort && answers[question.id] === question.correctIndex;
        const isUnsure = unsureIds.includes(question.id);
        const isActive = question.id === activeId;

        // Fill carries status; the ring carries position, so the two never
        // have to compete for the same visual channel. Correctness only
        // shows in immediate mode — end-only keeps a neutral "answered"
        // fill, since revealing right/wrong here would defeat the mode.
        let stateClass = "border-border bg-surface text-text-secondary";
        if (isUnsure) stateClass = "border-warning bg-warning-subtle text-warning";
        else if (isAnswered) {
          stateClass = showFeedback && !isShort
            ? isCorrect
              ? "border-success bg-success-subtle text-success"
              : "border-error bg-error-subtle text-error"
            : "border-border-strong bg-surface-alt text-text-primary";
        }

        const answeredState =
          showFeedback && !isShort ? (isCorrect ? "Correct" : "Incorrect") : "Answered";
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
            title={`Question ${index + 1}, ${state}${isActive ? ", currently viewing" : ""}`}
            aria-current={isActive ? "location" : undefined}
            className={`rounded border py-1 font-mono text-[0.8125rem] ${stateClass} ${
              isActive ? "ring-2 ring-text-secondary ring-offset-1" : ""
            }`}
          >
            {index + 1}
          </button>
        );
      })}
    </div>
  );

  const legend = (
    <div className="border-t border-border pt-3">
      <p className="text-[0.8125rem] font-medium text-text-primary">Legend</p>
      <dl className="mt-2 flex flex-col gap-1.5 text-[0.8125rem] text-text-secondary">
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
  );

  return (
    <div className="flex gap-10">
      <div className="min-w-0 flex-1">
        {/* Pinned below lg: the desktop rail is sticky, and without this the
            countdown scrolled off-screen after the first question on phones. */}
        <div className="sticky top-0 z-30 mb-4 border-b border-border bg-bg py-2 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.875rem] text-text-secondary">
              {answeredCount} of {questions.length} answered
            </p>
            <button
              type="button"
              onClick={() => setJumpOpen(true)}
              aria-haspopup="dialog"
              className="shrink-0 rounded-lg border border-border bg-surface-alt px-3 py-1 text-[0.875rem] font-medium text-text-primary"
            >
              Jump to question
            </button>
          </div>
          {/* No live region: a per-second announcement would be noise; the
              timeout lands on the results screen, which speaks for itself. */}
          {remainingSec !== null && (
            <p
              data-testid="quiz-timer"
              className={`mt-1 font-mono text-[1.125rem] font-semibold ${
                lowTime ? "text-error" : "text-text-primary"
              }`}
            >
              {formatCountdown(remainingSec)} left
            </p>
          )}
        </div>

        {jumpOpen && (
          // Bottom sheet: thumb-reachable on a phone, closes on pick, backdrop
          // tap or Escape. Same grid and legend as the desktop sidebar.
          <div
            className="fixed inset-0 z-50 flex items-end bg-black/50 lg:hidden"
            onClick={() => setJumpOpen(false)}
            onKeyDown={(e) => e.key === "Escape" && setJumpOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Jump to a question"
              onClick={(e) => e.stopPropagation()}
              className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl border-t border-border bg-bg px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[1rem] font-semibold text-text-primary">Jump to a question</p>
                <button
                  type="button"
                  autoFocus
                  onClick={() => setJumpOpen(false)}
                  className="rounded-lg px-3 text-[0.9375rem] font-medium text-text-secondary"
                >
                  Close
                </button>
              </div>
              {jumpGrid}
              <div className="mt-4">{legend}</div>
              <button
                type="button"
                onClick={() => {
                  setJumpOpen(false);
                  setConfirmCancelOpen(true);
                }}
                className="mt-5 w-full rounded-lg border border-error px-3 text-[0.9375rem] font-medium text-error"
              >
                Cancel quiz
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col">
          {groups.map((group) => {
            // Only a mono-kind stimulus (table, code, formula) gets the shared
            // problem block above the questions. A stimulus on any other type
            // is prose and belongs with its question as a quote — same call
            // the edit tab makes, so one value can't render two ways across
            // screens.
            const hasProblemBlock =
              Boolean(group.stimulus) &&
              isMonoKind(stimulusKindOf(format, group.questions[0].type));
            // Code-literal options stay monospace: the legacy standalone rule
            // plus any question under a code problem block.
            const groupKind = stimulusKindOf(format, group.questions[0].type);

            return (
            <section key={group.key} className="border-t border-border last:border-b">
              {hasProblemBlock && (
                <div id={`stimulus-${group.key}`} className="scroll-mt-24 lg:scroll-mt-6 pt-6">
                  <p className="font-mono text-[0.8125rem] tracking-wide text-text-tertiary uppercase">
                    {groupKind === "code" ? "Program" : "Problem"} · questions{" "}
                    {numbering.get(group.questions[0].id)}–
                    {numbering.get(group.questions[group.questions.length - 1].id)}
                  </p>
                  {group.title && (
                    <h2 className="mt-1 text-[1.0625rem] font-semibold text-text-primary">
                      {group.title}
                    </h2>
                  )}
                  <StimulusBlock
                    stimulus={group.stimulus!}
                    questionIds={group.questions.map((q) => q.id)}
                  />
                </div>
              )}

              {group.questions.map((question) => {
                const selected = answers[question.id];
                const isShort = isShortAnswer(question);
                const typed = textAnswers[question.id] ?? "";
                const isAnswered = isQuestionAnswered(question, answers, textAnswers);
                const isUnsure = unsureIds.includes(question.id);
                const isConfirmed = confirmedIds.includes(question.id);
                const revealAnswer =
                  showFeedback && isConfirmed && selected !== question.correctIndex;

                return (
                  <div
                    key={question.id}
                    id={`question-${question.id}`}
                    className={`scroll-mt-24 lg:scroll-mt-6 py-6 ${hasProblemBlock ? "border-t border-border" : ""}`}
                  >
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                  <span className="flex items-baseline gap-2 font-mono text-[0.875rem] font-bold tracking-wide text-text-primary">
                    {numbering.get(question.id)}.
                    {hasProblemBlock && (
                      <button
                        type="button"
                        onClick={() => {
                          document
                            .getElementById(`stimulus-${group.key}`)
                            ?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        className="font-sans text-[0.8125rem] font-normal text-text-tertiary underline decoration-dotted underline-offset-2 hover:text-text-secondary"
                      >
                        ↑ Back to problem
                      </button>
                    )}
                  </span>
                  {/* Both buttons never fit beside the number on a phone, and
                      `shrink-0` alone pushed one past the viewport edge.
                      Below `sm` they get the full row and wrap within it. */}
                  <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:shrink-0">
                    <button
                      type="button"
                      onClick={() => clearSelection(question.id)}
                      disabled={!isAnswered || isConfirmed}
                      title={
                        !isAnswered
                          ? "No answer selected yet"
                          : isConfirmed
                            ? "Answer is locked in immediate feedback mode"
                            : undefined
                      }
                      className="rounded-lg border border-border px-2.5 py-1 text-[0.875rem] font-medium text-text-secondary enabled:hover:border-border-strong enabled:hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isShort ? "Clear answer" : "Clear selection"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleUnsure(question.id)}
                      aria-pressed={isUnsure}
                      className={`rounded-lg border px-2.5 py-1 text-[0.875rem] font-medium ${
                        isUnsure
                          ? "border-warning bg-warning-subtle text-warning"
                          : "border-border text-text-secondary hover:border-border-strong hover:text-text-primary"
                      }`}
                    >
                      {isUnsure ? "Marked unsure" : "Mark as unsure"}
                    </button>
                  </div>
                </div>

                {!hasProblemBlock && question.stimulus && (
                  <StimulusQuote stimulus={question.stimulus} />
                )}

                <p
                  className={`mt-2 text-[1rem] leading-relaxed whitespace-pre-wrap text-text-primary ${
                    // A set's table/listing lives in the stimulus above, so the
                    // question itself is plain prose. Only the older standalone
                    // Timeline/Code questions carry their own preformatted text.
                    isPreformatted(question.type) && !group.stimulus ? "font-mono text-[0.9375rem]" : ""
                  }`}
                >
                  {question.question}
                </p>

                {isShort && (
                  <div className="mt-4">
                    <label htmlFor={`answer-${question.id}`} className="sr-only">
                      Your answer to question {numbering.get(question.id)}
                    </label>
                    <textarea
                      id={`answer-${question.id}`}
                      value={typed}
                      onChange={(e) => setText(question.id, e.target.value)}
                      maxLength={MAX_SHORT_ANSWER_CHARS}
                      rows={3}
                      placeholder="Type your answer in one to three sentences…"
                      className="w-full resize-y rounded-lg border border-border bg-surface p-3 text-[0.9375rem] text-text-primary outline-none focus:border-accent"
                    />
                    <div className="mt-1 flex items-center justify-between gap-3 text-[0.8125rem] text-text-tertiary">
                      <span>Graded by AI when you submit.</span>
                      <span>
                        {typed.length}/{MAX_SHORT_ANSWER_CHARS}
                      </span>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-2">
                  {question.options.map((option, optionIndex) => {
                    const isSelected = selected === optionIndex;
                    const isCorrectOption = optionIndex === question.correctIndex;

                    // Only ever styled in immediate mode, and only once the pick
                    // is confirmed: the picked option is marked right/wrong, and
                    // a wrong pick also points at the correct one so the
                    // question is actually worth something.
                    const locked = showFeedback && isConfirmed;

                    let stateClass = locked
                      ? "border-border"
                      : "border-border hover:border-border-strong";
                    if (showFeedback && isConfirmed && isSelected) {
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
                        className={`flex items-start gap-3 rounded-lg border px-3.5 py-2.5 ${
                          locked ? "cursor-default" : "cursor-pointer"
                        } ${stateClass}`}
                      >
                        <input
                          type="radio"
                          name={`q-${question.id}`}
                          checked={isSelected}
                          disabled={locked}
                          onChange={() => selectOption(question.id, optionIndex)}
                          className="mt-1 accent-accent disabled:cursor-default"
                        />
                        <span
                          className={`text-text-primary ${
                            groupKind === "code" &&
                            (hasProblemBlock || question.type === "code")
                              ? "font-mono text-[0.875rem]"
                              : "text-[0.9375rem]"
                          }`}
                        >
                          <span className="font-mono text-[0.8125rem] text-text-tertiary">
                            {optionLetter(optionIndex)}.
                          </span>{" "}
                          {option}
                        </span>
                        {showFeedback && isConfirmed && isSelected && (
                          <span
                            aria-live="polite"
                            className={`ml-auto shrink-0 self-center text-[0.875rem] font-medium ${
                              isCorrectOption ? "text-success" : "text-error"
                            }`}
                          >
                            {isCorrectOption ? "Correct" : "Incorrect"}
                          </span>
                        )}
                        {revealAnswer && !isSelected && isCorrectOption && (
                          <span aria-live="polite" className="ml-auto shrink-0 self-center text-[0.875rem] font-medium text-success">
                            Correct answer
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>

                {showFeedback && !isShort && (
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => confirmAnswer(question.id)}
                      disabled={!isAnswered || isConfirmed}
                      title={!isAnswered ? "Select an option first" : undefined}
                      className="rounded-lg border border-accent px-2.5 py-1 text-[0.875rem] font-medium text-accent enabled:hover:bg-accent-subtle disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isConfirmed ? "Answer confirmed" : "Confirm answer"}
                    </button>
                  </div>
                )}

                {showFeedback &&
                  isConfirmed &&
                  (question.explanation || question.whyOthersWrong) && (
                    <div aria-live="polite" className="mt-3 space-y-2 rounded-lg bg-surface-alt px-3.5 py-2.5 text-[0.875rem] leading-relaxed text-text-secondary">
                      {question.explanation && <p>{question.explanation}</p>}
                      {question.whyOthersWrong && <p>{question.whyOthersWrong}</p>}
                    </div>
                  )}
                  </div>
                );
              })}
            </section>
            );
          })}
        </div>

        <div className="mt-8 flex justify-end">
          <button
            onClick={handleSubmit}
            className="rounded-lg bg-accent px-4 py-2.5 text-[0.9375rem] font-medium text-on-accent hover:bg-accent-hover"
          >
            Submit quiz
          </button>
        </div>
      </div>

      <aside className="sticky top-6 hidden h-fit w-56 shrink-0 lg:block">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.875rem] text-text-secondary">
            {answeredCount} of {questions.length} answered
          </p>
          <button
            type="button"
            onClick={() => setConfirmCancelOpen(true)}
            className="shrink-0 rounded-lg border border-error px-2.5 py-1 text-[0.875rem] font-medium text-error hover:bg-error-subtle"
          >
            Cancel quiz
          </button>
        </div>
        {remainingSec !== null && (
          <p
            data-testid="quiz-timer"
            className={`mt-2 font-mono text-[1.375rem] font-semibold ${
              lowTime ? "text-error" : "text-text-primary"
            }`}
          >
            {formatCountdown(remainingSec)} left
          </p>
        )}

        <div className="mt-3">{jumpGrid}</div>

        <div className="mt-4">{legend}</div>

        <p className="mt-3 text-[0.8125rem] text-text-tertiary">
          Keys 1–4 answer the question in view, u flags it unsure, n/p move between questions.
        </p>
      </aside>

      {leaveTarget !== null && (
        <ConfirmDialog
          title="Leave this quiz?"
          body="Your answers are saved on this device. You can pick the quiz back up from this reviewer."
          confirmLabel="Leave quiz"
          cancelLabel="Keep working"
          onConfirm={confirmLeave}
          onCancel={() => setLeaveTarget(null)}
        />
      )}

      {confirmCancelOpen && (
        <ConfirmDialog
          title="Cancel this quiz?"
          body="Your progress will be lost. Nothing is saved to your attempts."
          confirmLabel="Confirm"
          cancelLabel="Keep working"
          destructive
          onConfirm={onCancel}
          onCancel={() => setConfirmCancelOpen(false)}
        />
      )}

      {confirmOpen && (
        <ConfirmDialog
          title="Submit with blanks?"
          body={`${unansweredCount} question${unansweredCount === 1 ? " is" : "s are"} still unanswered. Unanswered questions count as incorrect.`}
          confirmLabel="Submit anyway"
          cancelLabel="Keep working"
          onConfirm={() => {
            const elapsed = Math.round((Date.now() - resolvedStartedAt) / 1000);
            onSubmit(answers, unsureIds, { durationSec: elapsed, timedOut: false }, textAnswers);
          }}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
