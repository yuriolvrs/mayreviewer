"use client";

import { AttemptList } from "@/app/components/AttemptRow";
import type { QuizAttempt } from "@/app/types";

// The history rail beside quiz setup: past scores for this reviewer, kept in
// their own card so they read as record, not as part of the quiz being
// configured. Rows reopen their results; nothing here affects the next quiz.
export default function QuizAttempts({
  history,
  onViewAttempt,
}: {
  history: QuizAttempt[];
  onViewAttempt: (attempt: QuizAttempt) => void;
}) {
  return (
    <section
      aria-label="Your attempts"
      className="rounded-lg border border-border bg-surface p-5 lg:sticky lg:top-6"
    >
      <h2 className="text-[0.9375rem] font-semibold text-text-primary">
        Your attempts{history.length > 0 ? ` (${history.length})` : ""}
      </h2>
      {history.length === 0 ? (
        <p className="mt-2 text-[0.875rem] leading-snug text-text-secondary">
          No attempts yet. Your scores for this reviewer will show up here.
        </p>
      ) : (
        <>
          <p className="mt-1 text-[0.8125rem] leading-snug text-text-tertiary">
            Past scores for this reviewer.
          </p>
          <div className="mt-2">
            <AttemptList attempts={history} onOpen={onViewAttempt} />
          </div>
        </>
      )}
    </section>
  );
}
