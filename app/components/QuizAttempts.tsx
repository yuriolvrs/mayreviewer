"use client";

import { Fragment } from "react";
import { formatTakenAt, scoreTone } from "@/app/lib/questions";
import type { QuizAttempt } from "@/app/types";

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

function RefreshIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M8.5 5A3.5 3.5 0 0 1 2.4 7.1M1.5 5A3.5 3.5 0 0 1 7.6 2.9M7.6 2.9V1.2M7.6 2.9H5.9M2.4 7.1v1.7M2.4 7.1h1.7"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Sits between two attempts in place of the normal row hairline, marking that
// the pool was regenerated between them — so a score jump there reads as "new
// questions" rather than "got better at the same ones."
function NewQuestionsDivider() {
  return (
    <li className="flex items-center gap-3 py-3" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      {/* Pill sits on the card's surface fill, so it takes the alt fill to
          stay visible — on the open page it used the surface fill itself. */}
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-alt px-3 py-1 text-[12px] text-text-secondary">
        <RefreshIcon />
        New questions
      </span>
      <span className="h-px flex-1 bg-border" />
    </li>
  );
}

// How this attempt moved against the one before it. Compared in percent rather
// than raw score, since attempts can run at different question counts.
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
      <h2 className="text-[15px] font-semibold text-text-primary">
        Your attempts{history.length > 0 ? ` (${history.length})` : ""}
      </h2>
      {history.length === 0 ? (
        <p className="mt-2 text-[14px] leading-snug text-text-secondary">
          No attempts yet. Your scores for this reviewer will show up here.
        </p>
      ) : (
        <>
          <p className="mt-1 text-[13px] leading-snug text-text-tertiary">
            Past scores for this reviewer.
          </p>
          <ul className="mt-2 flex flex-col">
            {/* History is newest-first, so an attempt's predecessor is the row
                below it — and the last row has none to compare against. A
                divider takes the place of a row's top hairline wherever the
                pool was regenerated between it and its predecessor, and
                breaks the delta comparison there too — a score change across
                a regenerate isn't "better," it's a different set of questions. */}
            {history.map((attempt, index) => {
              const percent = Math.round((attempt.score / attempt.total) * 100);
              const previous = history[index + 1];
              const isGroupStart =
                index > 0 && attempt.questionSetGeneratedAt !== history[index - 1].questionSetGeneratedAt;
              // A regenerate sits between this attempt and `previous`, so
              // their scores aren't comparable — same check as isGroupStart,
              // just facing the other direction in the list.
              const comparable =
                previous && attempt.questionSetGeneratedAt === previous.questionSetGeneratedAt;
              const summary = (
                <>
                  <span className="text-text-secondary">{formatTakenAt(attempt.takenAt)}</span>
                  {/* Delta and score travel together on the right, so the
                      comparison reads against the number it qualifies. */}
                  <span className="ml-auto flex items-center gap-3">
                    {comparable && (
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
                <Fragment key={attempt.id}>
                  {isGroupStart && <NewQuestionsDivider />}
                  <li className={`${isGroupStart ? "" : "border-t border-border"} last:border-b`}>
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
                </Fragment>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
