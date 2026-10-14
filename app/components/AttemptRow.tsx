"use client";

import Link from "next/link";
import { Fragment } from "react";
import { attemptPercent, formatScore, formatTakenAt, scoreVerdict } from "@/app/lib/questions";
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
// the pool was regenerated between them, so a score jump there reads as "new
// questions" rather than "got better at the same ones."
function NewQuestionsDivider() {
  return (
    <li className="flex items-center gap-3 py-3" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-alt px-3 py-1 text-[0.75rem] text-text-secondary">
        <RefreshIcon />
        New questions
      </span>
      <span className="h-px flex-1 bg-border" />
    </li>
  );
}

// How this attempt moved against the one before it, in percentage points.
// Compared in percent rather than raw score, since attempts can run at
// different question counts.
function Delta({ change }: { change: number }) {
  const [arrow, tone, label] =
    change > 0
      ? ["↑", "text-success", "up"]
      : change < 0
        ? ["↓", "text-error", "down"]
        : ["–", "text-text-tertiary", "unchanged"];

  return (
    <span
      className={`text-[0.875rem] ${tone}`}
      title={`${Math.abs(change)} points ${label} from the previous attempt`}
    >
      {arrow} {Math.abs(change)} pts
    </span>
  );
}

// One attempt: date on the left, delta + mono score + verdict word on the
// right. Opens through `href` (a link) or `onOpen` (a button); with neither, or
// with no saved answers, it renders as a plain row with the same box model so
// openable and non-openable rows line up.
export default function AttemptRow({
  attempt,
  delta,
  href,
  onOpen,
}: {
  attempt: QuizAttempt;
  delta: number | null;
  href?: string;
  onOpen?: (attempt: QuizAttempt) => void;
}) {
  const percent = attemptPercent(attempt);
  const noAnswers = attempt.questions.length === 0;
  const openable = !noAnswers && (href !== undefined || onOpen !== undefined);
  const verdict = percent === null ? null : scoreVerdict(percent);

  const body = (
    <>
      <span className="flex min-w-0 flex-col">
        <span className="text-text-secondary">{formatTakenAt(attempt.takenAt)}</span>
        {(percent === null || noAnswers) && (
          <span className="text-[0.8125rem] leading-snug text-text-tertiary">
            Answers weren&apos;t saved for this attempt
          </span>
        )}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-3 whitespace-nowrap">
        {delta !== null && <Delta change={delta} />}
        {percent === null ? (
          <span className="text-[0.875rem] text-text-tertiary">No score recorded</span>
        ) : (
          <span className="flex flex-col items-end">
            <span className={`font-mono font-medium ${verdict!.tone}`}>
              {formatScore(attempt.score)} / {attempt.total}
              <span className="ml-2">{percent}%</span>
            </span>
            <span className={`text-[0.8125rem] ${verdict!.tone}`}>{verdict!.word}</span>
          </span>
        )}
      </span>
      {/* Slot stays a fixed w-4 whether or not the chevron renders, so the
          score column never shifts. */}
      <span
        aria-hidden="true"
        className={`w-4 shrink-0 text-text-tertiary ${openable ? "group-hover:text-text-primary" : ""}`}
      >
        {openable && <ChevronRightIcon />}
      </span>
    </>
  );

  const base = "flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-3 text-left text-[0.9375rem]";
  if (openable && href !== undefined) {
    return (
      <Link href={href} title="View these results" className={`group ${base} hover:bg-surface-alt`}>
        {body}
      </Link>
    );
  }
  if (openable) {
    return (
      <button
        type="button"
        onClick={() => onOpen!(attempt)}
        title="View these results"
        className={`group ${base} hover:bg-surface-alt`}
      >
        {body}
      </button>
    );
  }
  return <div className={`${base} cursor-default`}>{body}</div>;
}

// A newest-first run of attempts for one reviewer. An attempt's predecessor is
// the row below it. A divider replaces a row's top hairline wherever the pool
// was regenerated between it and its predecessor, and breaks the delta
// comparison there too: a score change across a regenerate isn't "better,"
// it's a different set of questions.
export function AttemptList({
  attempts,
  hrefFor,
  onOpen,
}: {
  attempts: QuizAttempt[];
  hrefFor?: (attempt: QuizAttempt) => string | undefined;
  onOpen?: (attempt: QuizAttempt) => void;
}) {
  return (
    <ul className="flex flex-col">
      {attempts.map((attempt, index) => {
        const previous = attempts[index + 1];
        const isGroupStart =
          index > 0 && attempt.questionSetGeneratedAt !== attempts[index - 1].questionSetGeneratedAt;
        const comparable = previous && attempt.questionSetGeneratedAt === previous.questionSetGeneratedAt;
        const percent = attemptPercent(attempt);
        const previousPercent = previous ? attemptPercent(previous) : null;
        const delta =
          comparable && percent !== null && previousPercent !== null ? percent - previousPercent : null;
        return (
          <Fragment key={attempt.id}>
            {isGroupStart && <NewQuestionsDivider />}
            <li className={`${isGroupStart ? "" : "border-t border-border"} last:border-b`}>
              <AttemptRow attempt={attempt} delta={delta} href={hrefFor?.(attempt)} onOpen={onOpen} />
            </li>
          </Fragment>
        );
      })}
    </ul>
  );
}
