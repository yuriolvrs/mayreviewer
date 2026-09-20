"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getQuizHistory, getReviewer, saveQuizAttempt } from "@/app/lib/storage";
import { clearQuizProgress, getQuizProgress, saveQuizProgress } from "@/app/lib/quizProgress";
import { getSettings } from "@/app/lib/settings";
import { resolveFromList } from "@/app/lib/examFormats";
import { useFormats, useFormatsLoaded } from "@/app/lib/useFormats";
import { shuffleOptions } from "@/app/lib/questions";
import type { FeedbackMode, Question, QuizAttempt, Reviewer } from "@/app/types";
import QuizTaking, { type Answers } from "@/app/components/QuizTaking";
import QuizResults from "@/app/components/QuizResults";
import QuizSetup from "@/app/components/QuizSetup";
import QuizAttempts from "@/app/components/QuizAttempts";

type Stage = "setup" | "taking" | "results";

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
  const [submitted, setSubmitted] = useState<{ answers: Answers; unsureIds: string[] } | null>(null);
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
      setSubmitted({ answers: attempt.answers, unsureIds: attempt.unsureIds });
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
        setInitialUnsureIds(progress.unsureIds);
        setInitialConfirmedIds(progress.confirmedIds);
        setStage("taking");
      }
    }
  }, [id, attemptId]);

  if (reviewer === undefined || !formatsLoaded) return null;

  if (reviewer === null) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <p className="text-text-secondary">Reviewer not found.</p>
        <Link href="/" className="text-[15px] font-medium text-accent underline">
          Back to Home
        </Link>
      </div>
    );
  }

  const total = reviewer.questions.length;
  const format = resolveFromList(formats, formatId ?? reviewer.examFormatId);

  if (stage === "taking") {
    return (
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <h1 className="text-[26px] font-semibold text-text-primary">{reviewer.reviewerName}</h1>
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
          initialUnsureIds={initialUnsureIds}
          initialConfirmedIds={initialConfirmedIds}
          onCancel={() => {
            clearQuizProgress(reviewer.id);
            setStartedAt(null);
            setInitialAnswers({});
            setInitialUnsureIds([]);
            setInitialConfirmedIds([]);
            setStage("setup");
            window.scrollTo({ top: 0 });
          }}
          onSubmit={(answers, unsureIds, timing) => {
            // The budget and the par travel with the attempt so milestones
            // can tell timed quizzes apart — and fast ones — later.
            saveQuizAttempt(reviewer, quizQuestions, answers, unsureIds, {
              ...timing,
              timeLimitSec,
              parSec,
            });
            clearQuizProgress(reviewer.id);
            setHistory(getQuizHistory(reviewer.id));
            setSubmitted({ answers, unsureIds });
            setResultTiming(timing);
            setStartedAt(null);
            setInitialAnswers({});
            setInitialUnsureIds([]);
            setInitialConfirmedIds([]);
            setStage("results");
            window.scrollTo({ top: 0 });
          }}
        />
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
        className="text-[15px] text-text-secondary hover:text-text-primary"
      >
        ← Details
      </Link>

      <h1 className="mt-4 text-[26px] font-semibold text-text-primary">
        {reviewer.reviewerName} - Quiz
      </h1>
      <p className="mt-1 text-[16px] font-medium text-text-primary">
        {total} question{total === 1 ? "" : "s"}
      </p>

      {total === 0 ? (
        <p className="mt-8 text-[15px] text-text-secondary">
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
              setSubmitted({ answers: attempt.answers, unsureIds: attempt.unsureIds });
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
