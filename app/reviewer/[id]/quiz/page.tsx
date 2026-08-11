"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getQuizHistory, getReviewer, saveQuizAttempt } from "@/app/lib/storage";
import type { FeedbackMode, Question, QuizAttempt, Reviewer } from "@/app/types";
import QuizTaking, { type Answers } from "@/app/components/QuizTaking";
import QuizResults from "@/app/components/QuizResults";
import QuizSetup from "@/app/components/QuizSetup";

type Stage = "setup" | "taking" | "results";

export default function QuizPage() {
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

  useEffect(() => {
    // localStorage is a browser-only external store; one-off read on mount is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReviewer(getReviewer(id) ?? null);
    const attempts = getQuizHistory(id);
    setHistory(attempts);

    // Arrived from the global History screen for one specific attempt — open
    // it the same way QuizSetup's onViewAttempt does.
    const attempt = attemptId ? attempts.find((a) => a.id === attemptId) : undefined;
    if (attempt) {
      setQuizQuestions(attempt.questions);
      setSubmitted({ answers: attempt.answers, unsureIds: attempt.unsureIds });
      setReviewedAt(attempt.takenAt);
      setStage("results");
    }
  }, [id, attemptId]);

  if (reviewer === undefined) return null;

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

  if (stage === "taking") {
    return (
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <h1 className="text-[26px] font-semibold text-text-primary">{reviewer.reviewerName}</h1>
        <QuizTaking
          questions={quizQuestions}
          feedbackMode={feedbackMode}
          onCancel={() => {
            setStage("setup");
            window.scrollTo({ top: 0 });
          }}
          onSubmit={(answers, unsureIds) => {
            saveQuizAttempt(reviewer.id, quizQuestions, answers, unsureIds);
            setHistory(getQuizHistory(reviewer.id));
            setSubmitted({ answers, unsureIds });
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
          questions={quizQuestions}
          answers={submitted.answers}
          unsureIds={submitted.unsureIds}
          takenAt={reviewedAt ?? undefined}
          onRetake={() => {
            // Fresh attempt: QuizTaking is remounted by the stage switch, so
            // answers and unsure flags both start empty again. Reopened from
            // history, this re-serves that attempt's exact question set.
            setSubmitted(null);
            setReviewedAt(null);
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
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <Link
        href={`/reviewer/${reviewer.id}`}
        className="text-[15px] text-text-secondary hover:text-text-primary"
      >
        ← {reviewer.reviewerName}
      </Link>

      <h1 className="mt-4 text-[26px] font-semibold text-text-primary">Quiz this reviewer</h1>
      <p className="mt-1 text-[15px] text-text-secondary">
        {total} question{total === 1 ? "" : "s"} in this reviewer&apos;s pool.
      </p>

      {total === 0 ? (
        <p className="mt-8 text-[15px] text-text-secondary">
          No questions yet — generate some in the Questions tab first.
        </p>
      ) : (
        <QuizSetup
          reviewer={reviewer}
          history={history}
          feedbackMode={feedbackMode}
          onFeedbackModeChange={setFeedbackMode}
          onStart={(questions) => {
            setQuizQuestions(questions);
            setStage("taking");
            window.scrollTo({ top: 0 });
          }}
          onViewAttempt={(attempt) => {
            // The attempt carries its own copy of what it asked, so reopening
            // it doesn't depend on those questions still being in the pool.
            setQuizQuestions(attempt.questions);
            setSubmitted({ answers: attempt.answers, unsureIds: attempt.unsureIds });
            setReviewedAt(attempt.takenAt);
            setStage("results");
            window.scrollTo({ top: 0 });
          }}
        />
      )}
    </div>
  );
}
