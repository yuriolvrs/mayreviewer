"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import {
  getQuizHistory,
  getReviewer,
  overrideGrade,
  saveQuizAttempt,
  updateAttemptGrades,
} from "@/app/lib/storage";
import { gradeShortAnswers } from "@/app/lib/grade";
import { blankGrade, buildGradeItems } from "@/app/lib/grading";
import { clearQuizProgress, getQuizProgress, saveQuizProgress } from "@/app/lib/quizProgress";
import { getSettings } from "@/app/lib/settings";
import { resolveFromList } from "@/app/lib/examFormats";
import PageSkeleton from "@/app/components/PageSkeleton";
import { useFormats, useFormatsLoaded } from "@/app/lib/useFormats";
import { shuffleOptions } from "@/app/lib/questions";
import type { FeedbackMode, Question, QuizAttempt, Reviewer, ShortGrade } from "@/app/types";
import QuizTaking, { type Answers } from "@/app/components/QuizTaking";
import QuizResults from "@/app/components/QuizResults";
import QuizSetup from "@/app/components/QuizSetup";
import QuizAttempts from "@/app/components/QuizAttempts";
import GradingModal, { type GradingState } from "@/app/components/GradingModal";

type Stage = "setup" | "taking" | "results";

// What the results screen shows: the answers, any typed short answers with
// their grades, and the saved attempt they belong to (null only before the
// attempt is written), which grading retries and overrides write back to.
type Submitted = {
  answers: Answers;
  textAnswers: Record<string, string>;
  grades: Record<string, ShortGrade>;
  unsureIds: string[];
  attemptId: string | null;
};

// An attempt waiting on its grades. Held while the grade call runs so a failed
// call can be retried, or saved ungraded, without the reader typing it again.
type PendingSubmit = {
  answers: Answers;
  unsureIds: string[];
  timing: { durationSec: number; timedOut: boolean };
  textAnswers: Record<string, string>;
};

export default function QuizPage() {
  return (
    <Suspense fallback={null}>
      <QuizPageInner />
    </Suspense>
  );
}

function QuizPageInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  // Set when the global History screen links here to reopen one specific
  // attempt, rather than the per-Reviewer history list. Determines where
  // the results screen's "Your attempts" back link returns to.
  const attemptId = useSearchParams().get("attempt");

  const [reviewer, setReviewer] = useState<Reviewer | null | undefined>(undefined);
  const [history, setHistory] = useState<QuizAttempt[]>([]);
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>("immediate");
  const [stage, setStage] = useState<Stage>("setup");
  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  // Set while short answers are being graded at submit, or while that failed
  // and the reader is choosing between retry and saving without grades.
  const [grading, setGrading] = useState<GradingState | null>(null);
  const pendingRef = useRef<PendingSubmit | null>(null);
  // Guards against a second submit while grading is in flight — the countdown
  // can expire during the call and would otherwise save the attempt twice.
  const submittingRef = useRef(false);
  // The sampled subset for this attempt — scoring and results must run against
  // exactly what was asked, not the reviewer's whole pool.
  const [quizQuestions, setQuizQuestions] = useState<Question[]>([]);
  // Set only while reopening an attempt from the history list; the results
  // screen uses it to label which attempt is on screen.
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);
  // Countdown budget picked in Quiz Setup (null = untimed). Survives the
  // taking/results switches — retakes run under the same limit, and the
  // remounted QuizTaking continues its clock from `startedAt`.
  const [timeLimitSec, setTimeLimitSec] = useState<number | null>(null);
  // Pace estimate for the served questions, in seconds — recorded on the
  // attempt at submit for the Speedster badge. 0 means unknown (resumed
  // pre-par snapshots, reopened history), which never counts as speedy.
  const [parSec, setParSec] = useState(0);  // Wall-clock start of the attempt on screen, persisted so a refresh keeps
  // the countdown accurate. Fresh attempts stamp it at start; restores reuse
  // the saved value; cleared on submit/cancel.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  // Seeded answers for the mounted QuizTaking — empty on a fresh start,
  // restored from progress after a refresh.
  const [initialAnswers, setInitialAnswers] = useState<Answers>({});
  const [initialTextAnswers, setInitialTextAnswers] = useState<Record<string, string>>({});
  const [initialUnsureIds, setInitialUnsureIds] = useState<string[]>([]);
  const [initialConfirmedIds, setInitialConfirmedIds] = useState<string[]>([]);
  // Timing of the attempt on screen, for the results line. Set on submit and
  // from the reopened attempt's snapshot; cleared on retake.
  const [resultTiming, setResultTiming] = useState<{ durationSec: number; timedOut: boolean } | null>(null);
  // Which format the current taking/results screens render under. Fresh
  // attempts use the reviewer's; reopened ones use the attempt's own snapshot,
  // so a format edited since still reopens truthfully.
  const [formatId, setFormatId] = useState<string | null>(null);
  // Hook above the early returns below: hooks can't sit behind them.
  const formats = useFormats();
  const formatsLoaded = useFormatsLoaded();

  useEffect(() => {
    // localStorage is a browser-only external store; one-off read on mount is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReviewer(getReviewer(id) ?? null);
    setFeedbackMode(getSettings().feedbackMode);
    const attempts = getQuizHistory(id);
    setHistory(attempts);

    // Arrived from the global History screen for one specific attempt — open
    // it the same way QuizSetup's onViewAttempt does.
    const attempt = attemptId ? attempts.find((a) => a.id === attemptId) : undefined;
    if (attempt) {
      setQuizQuestions(attempt.questions);
      setSubmitted({
        answers: attempt.answers,
        textAnswers: attempt.textAnswers ?? {},
        grades: attempt.grades ?? {},
        unsureIds: attempt.unsureIds,
        attemptId: attempt.id,
      });
      setReviewedAt(attempt.takenAt);
      setFormatId(attempt.examFormatId);
      setStage("results");
    } else {
      // Refresh mid-quiz: resume the in-progress attempt instead of
      // dropping back to setup. The countdown stays accurate because the
      // saved startedAt is reused rather than restamped.
      const progress = getQuizProgress(id);
      if (progress) {
        setQuizQuestions(progress.quizQuestions);
        setFeedbackMode(progress.feedbackMode);
        setTimeLimitSec(progress.timeLimitSec);
        setParSec(progress.parSec ?? 0);
        setFormatId(progress.formatId);
        setStartedAt(progress.startedAt);
        setInitialAnswers(progress.answers);
        setInitialTextAnswers(progress.textAnswers ?? {});
        setInitialUnsureIds(progress.unsureIds);
        setInitialConfirmedIds(progress.confirmedIds);
        setStage("taking");
      }
    }
  }, [id, attemptId]);

  if (reviewer === undefined || !formatsLoaded) return <PageSkeleton maxWidth="max-w-5xl" />;

  if (reviewer === null) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <p className="text-text-secondary">Reviewer not found.</p>
        <Link href="/" className="text-[0.9375rem] font-medium text-accent underline">
          Back to Home
        </Link>
      </div>
    );
  }

  const total = reviewer.questions.length;
  const format = resolveFromList(formats, formatId ?? reviewer.examFormatId);

  // Writes the finished attempt and moves to the results screen. Grades are
  // whatever the grade call returned (or the ungraded placeholders).
  const recordAttempt = (pending: PendingSubmit, grades: Record<string, ShortGrade>) => {
    // The budget and the par travel with the attempt so milestones can tell
    // timed quizzes apart — and fast ones — later.
    const attempt = saveQuizAttempt(
      reviewer,
      quizQuestions,
      pending.answers,
      pending.unsureIds,
      { ...pending.timing, timeLimitSec, parSec },
      { textAnswers: pending.textAnswers, grades },
    );
    clearQuizProgress(reviewer.id);
    setHistory(getQuizHistory(reviewer.id));
    setSubmitted({
      answers: pending.answers,
      textAnswers: pending.textAnswers,
      grades,
      unsureIds: pending.unsureIds,
      attemptId: attempt.id,
    });
    setResultTiming(pending.timing);
    setStartedAt(null);
    setInitialAnswers({});
    setInitialTextAnswers({});
    setInitialUnsureIds([]);
    setInitialConfirmedIds([]);
    setGrading(null);
    pendingRef.current = null;
    submittingRef.current = false;
    setStage("results");
    window.scrollTo({ top: 0 });
  };

  // Submit: grade the short answers (if any) in one call, then save. Choice-
  // only attempts skip straight to saving. A blank answer is graded locally
  // and never sent, so an attempt of blanks needs no call at all.
  const submitAttempt = async (pending: PendingSubmit) => {
    submittingRef.current = true;
    const items = buildGradeItems(quizQuestions, pending.textAnswers);
    const sendable = items.filter((item) => item.answer.trim() !== "");

    if (sendable.length === 0) {
      const grades: Record<string, ShortGrade> = {};
      for (const item of items) grades[item.id] = blankGrade();
      recordAttempt(pending, grades);
      return;
    }

    pendingRef.current = pending;
    setGrading({ phase: "running" });
    try {
      const result = await gradeShortAnswers(items);
      const grades: Record<string, ShortGrade> = { ...result.grades };
      // An item the grader skipped is saved ungraded, not as a zero.
      for (const item of items) {
        if (!grades[item.id]) grades[item.id] = { met: [], feedback: "", credit: 0, ungraded: true };
      }
      recordAttempt(pending, grades);
    } catch (err) {
      submittingRef.current = false;
      setGrading({
        phase: "error",
        message: err instanceof Error ? err.message : "Grading failed.",
      });
    }
  };

  // The reader chose to keep the attempt without grades. Typed text is kept,
  // so it can be graded later from the results screen.
  const saveUngraded = () => {
    const pending = pendingRef.current;
    if (!pending) return;
    const grades: Record<string, ShortGrade> = {};
    for (const item of buildGradeItems(quizQuestions, pending.textAnswers)) {
      grades[item.id] =
        item.answer.trim() === "" ? blankGrade() : { met: [], feedback: "", credit: 0, ungraded: true };
    }
    recordAttempt(pending, grades);
  };

  // Results screen: grade the answers that were saved without one.
  const gradeNow = async (): Promise<string | null> => {
    if (!submitted?.attemptId) return "This attempt can't be graded again.";
    const items = buildGradeItems(quizQuestions, submitted.textAnswers).filter((item) => {
      const grade = submitted.grades[item.id];
      return !grade || grade.ungraded === true;
    });
    if (items.length === 0) return null;
    try {
      const result = await gradeShortAnswers(items);
      const updated = updateAttemptGrades(submitted.attemptId, result.grades);
      if (!updated) return "This attempt no longer exists.";
      setSubmitted({ ...submitted, grades: updated.grades ?? {} });
      setHistory(getQuizHistory(reviewer.id));
      return result.failed.length > 0 ? "Some answers still couldn't be graded. Try again." : null;
    } catch (err) {
      return err instanceof Error ? err.message : "Grading failed.";
    }
  };

  // Results screen: count one short answer as fully right or fully wrong.
  const overrideShortGrade = (questionId: string, credit: 0 | 1) => {
    if (!submitted?.attemptId) return;
    const updated = overrideGrade(submitted.attemptId, questionId, credit);
    if (!updated) return;
    setSubmitted({ ...submitted, grades: updated.grades ?? {} });
    setHistory(getQuizHistory(reviewer.id));
  };

  if (stage === "taking") {
    return (
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <h1 className="text-[1.625rem] font-semibold text-text-primary">{reviewer.reviewerName}</h1>
        <QuizTaking
          questions={quizQuestions}
          format={format}
          feedbackMode={feedbackMode}
          timeLimitSec={timeLimitSec}
          parSec={parSec}
          reviewerId={reviewer.id}
          formatId={formatId}
          startedAt={startedAt ?? undefined}
          initialAnswers={initialAnswers}
          initialTextAnswers={initialTextAnswers}
          initialUnsureIds={initialUnsureIds}
          initialConfirmedIds={initialConfirmedIds}
          onCancel={() => {
            clearQuizProgress(reviewer.id);
            setStartedAt(null);
            setInitialAnswers({});
            setInitialTextAnswers({});
            setInitialUnsureIds([]);
            setInitialConfirmedIds([]);
            setStage("setup");
            window.scrollTo({ top: 0 });
          }}
          onSubmit={(answers, unsureIds, timing, textAnswers) => {
            if (submittingRef.current) return;
            void submitAttempt({ answers, unsureIds, timing, textAnswers });
          }}
        />
        {grading && (
          <GradingModal
            state={grading}
            onRetry={() => {
              if (pendingRef.current) void submitAttempt(pendingRef.current);
            }}
            onSaveUngraded={saveUngraded}
          />
        )}
      </div>
    );
  }

  if (stage === "results" && submitted) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <QuizResults
          reviewerId={reviewer.id}
          reviewerName={reviewer.reviewerName}
          format={format}
          questions={quizQuestions}
          answers={submitted.answers}
          textAnswers={submitted.textAnswers}
          grades={submitted.grades}
          onOverride={submitted.attemptId ? overrideShortGrade : undefined}
          onGradeNow={submitted.attemptId ? gradeNow : undefined}
          unsureIds={submitted.unsureIds}
          takenAt={reviewedAt ?? undefined}
          durationSec={resultTiming?.durationSec}
          timedOut={resultTiming?.timedOut}
          onRetake={() => {
            // Fresh attempt: QuizTaking is remounted by the stage switch, so
            // answers and unsure flags both start empty again. Reopened from
            // history, this re-serves that attempt's question set, reshuffled
            // unless the user turned shuffle off in Settings. Saved as fresh
            // progress so the retake itself survives a refresh too.
            const next = getSettings().shuffle ? quizQuestions.map(shuffleOptions) : quizQuestions;
            const now = Date.now();
            setQuizQuestions(next);
            setStartedAt(now);
            setInitialAnswers({});
            setInitialTextAnswers({});
            setInitialUnsureIds([]);
            setInitialConfirmedIds([]);
            saveQuizProgress({
              reviewerId: reviewer.id,
              quizQuestions: next,
              answers: {},
              unsureIds: [],
              confirmedIds: [],
              timeLimitSec,
              parSec,
              startedAt: now,
              formatId,
              feedbackMode,
              savedAt: now,
            });
            setSubmitted(null);
            setReviewedAt(null);
            setResultTiming(null);
            setStage("taking");
            window.scrollTo({ top: 0 });
          }}
          onBack={
            reviewedAt
              ? attemptId
                ? () => router.push("/history")
                : () => {
                    setSubmitted(null);
                    setReviewedAt(null);
                    setStage("setup");
                    window.scrollTo({ top: 0 });
                  }
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <Link
        href={`/reviewer/${reviewer.id}`}
        className="text-[0.9375rem] text-text-secondary hover:text-text-primary"
      >
        ← Details
      </Link>

      <h1 className="mt-4 text-[1.625rem] font-semibold text-text-primary">
        {reviewer.reviewerName} - Quiz
      </h1>
      <p className="mt-1 text-[1rem] font-medium text-text-primary">
        {total} question{total === 1 ? "" : "s"}
      </p>

      {total === 0 ? (
        <p className="mt-8 text-[0.9375rem] text-text-secondary">
          No questions yet — generate some in the Questions tab first.
        </p>
      ) : (
        // Setup flows in the main column while past attempts sit in their own
        // rail — record beside configuration, never inside it. Stacks with
        // the rail below Start on narrow screens.
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
          <QuizSetup
            reviewer={reviewer}
            history={history}
            feedbackMode={feedbackMode}
            onFeedbackModeChange={setFeedbackMode}
            onStart={(questions, opts) => {
              const served = getSettings().shuffle ? questions.map(shuffleOptions) : questions;
              const now = Date.now();
              setQuizQuestions(served);
              setFormatId(reviewer.examFormatId);
              setTimeLimitSec(opts.timeLimitSec);
              setParSec(opts.parSec);
              setStartedAt(now);
              setInitialAnswers({});
              setInitialUnsureIds([]);
              setInitialConfirmedIds([]);
              saveQuizProgress({
                reviewerId: reviewer.id,
                quizQuestions: served,
                answers: {},
                unsureIds: [],
                confirmedIds: [],
                timeLimitSec: opts.timeLimitSec,
                parSec: opts.parSec,
                startedAt: now,
                formatId: reviewer.examFormatId,
                feedbackMode,
                savedAt: now,
              });
              setStage("taking");
              window.scrollTo({ top: 0 });
            }}
          />
          <QuizAttempts
            history={history}
            onViewAttempt={(attempt) => {
              // The attempt carries its own copy of what it asked, so reopening
              // it doesn't depend on those questions still being in the pool.
              setQuizQuestions(attempt.questions);
              setSubmitted({
                answers: attempt.answers,
                textAnswers: attempt.textAnswers ?? {},
                grades: attempt.grades ?? {},
                unsureIds: attempt.unsureIds,
                attemptId: attempt.id,
              });
              setReviewedAt(attempt.takenAt);
              setResultTiming({ durationSec: attempt.durationSec ?? 0, timedOut: attempt.timedOut ?? false });
              setFormatId(attempt.examFormatId);
              setStage("results");
              window.scrollTo({ top: 0 });
            }}
          />
        </div>
      )}
    </div>
  );
}
