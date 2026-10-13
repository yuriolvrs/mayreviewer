"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  formatCountdown,
  formatScore,
  groupQuestions,
  isFullCredit,
  isPreformatted,
  isShortAnswer,
  optionLetter,
  scoreTone,
  sumCredit,
} from "@/app/lib/questions";
import {
  formatTypeKeys,
  isMonoKind,
  stimulusKindOf,
  typeLabelOf,
  type ExamFormat,
} from "@/app/lib/examFormats";
import StimulusBlock from "@/app/components/StimulusBlock";
import StimulusQuote from "@/app/components/StimulusQuote";
import type { QuestionGroup } from "@/app/lib/questions";
import type { Question, ShortGrade } from "@/app/types";
import type { Answers } from "@/app/components/QuizTaking";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
    >
      <path
        d="M2 4l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Missed and Marked unsure open by default — they're what the screen is for.
// Correct is the long tail you go looking for, so it starts closed.
function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="mt-10">
      <h2>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1 text-[1.1875rem] font-semibold text-text-secondary hover:bg-surface-alt hover:text-text-primary"
        >
          <Chevron open={open} />
          <span className="text-text-primary">{title}</span>
          {count > 0 && <span>({count})</span>}
        </button>
      </h2>
      {open && children}
    </section>
  );
}

// Everything a short-answer row needs beyond the choice answers. Absent for
// attempts with no short questions, so choice-only screens are untouched.
type ShortContext = {
  textAnswers: Record<string, string>;
  grades: Record<string, ShortGrade>;
  // Set only when there is a saved attempt to write an override to.
  onOverride?: (questionId: string, credit: 0 | 1) => void;
};

function ShortResult({ question, short }: { question: Question; short: ShortContext }) {
  const typed = (short.textAnswers[question.id] ?? "").trim();
  const grade = short.grades[question.id];
  const ungraded = !grade || grade.ungraded === true;
  const points = question.keyPoints ?? [];
  const credit = grade?.credit ?? 0;
  const tone = ungraded
    ? "text-text-secondary"
    : credit >= 1
      ? "text-success"
      : credit > 0
        ? "text-warning"
        : "text-error";

  let verdict: string;
  if (ungraded) verdict = "Not graded yet";
  else if (grade.overridden) verdict = credit >= 1 ? "Counted as correct (your override)" : "Counted as incorrect (your override)";
  else verdict = `${grade.met.length}/${points.length} key point${points.length === 1 ? "" : "s"} covered`;

  return (
    <div className="mt-3 flex flex-col gap-3 text-[0.9375rem]">
      <dl className="flex flex-col gap-1">
        <div className="flex gap-2">
          <dt className="shrink-0 text-text-secondary">Your answer:</dt>
          <dd className="min-w-0 break-words whitespace-pre-wrap text-text-primary">
            {typed === "" ? <span className="text-text-tertiary">Left blank</span> : typed}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-text-secondary">Model answer:</dt>
          <dd className="min-w-0 break-words text-success">{question.modelAnswer}</dd>
        </div>
      </dl>

      <div>
        <p className={`font-medium ${tone}`}>{verdict}</p>
        <ul className="mt-1 flex flex-col gap-1">
          {points.map((point, i) => {
            const met = !ungraded && grade.met.includes(i);
            return (
              <li key={i} className="flex gap-2 text-[0.875rem]">
                <span
                  aria-hidden="true"
                  className={ungraded ? "text-text-tertiary" : met ? "text-success" : "text-error"}
                >
                  {ungraded ? "•" : met ? "✓" : "✕"}
                </span>
                <span className="sr-only">{ungraded ? "" : met ? "Covered: " : "Missed: "}</span>
                <span className={`min-w-0 break-words ${met ? "text-text-primary" : "text-text-secondary"}`}>
                  {point}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {grade?.feedback && (
        <p className="text-[0.875rem] leading-relaxed text-text-secondary">{grade.feedback}</p>
      )}

      {!ungraded && short.onOverride && (
        <div className="flex flex-wrap gap-2">
          {credit < 1 && (
            <button
              type="button"
              onClick={() => short.onOverride?.(question.id, 1)}
              className="rounded-lg border border-border px-2.5 py-1 text-[0.875rem] font-medium text-text-secondary hover:border-border-strong hover:text-text-primary"
            >
              Count as correct
            </button>
          )}
          {credit > 0 && (
            <button
              type="button"
              onClick={() => short.onOverride?.(question.id, 0)}
              className="rounded-lg border border-border px-2.5 py-1 text-[0.875rem] font-medium text-text-secondary hover:border-border-strong hover:text-text-primary"
            >
              Count as incorrect
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ResultRow({
  question,
  number,
  answers,
  inGroup,
  short,
}: {
  question: Question;
  number: number;
  answers: Answers;
  inGroup: boolean;
  short?: ShortContext;
}) {
  const given = answers[question.id];

  return (
    <>
      <span className="font-mono text-[0.875rem] font-bold text-text-primary">{number}.</span>
      {/* A set's listing is shown once above by `GroupBlock`; a prose stimulus
          on a standalone question has no block of its own, so it rides here. */}
      {!inGroup && question.stimulus && <StimulusQuote stimulus={question.stimulus} />}
      <p
        className={`mt-2 text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-text-primary ${
          // A set's listing lives in the shared block above, so only a
          // standalone Timeline/Code question carries preformatted text itself.
          isPreformatted(question.type) && !inGroup ? "font-mono" : ""
        }`}
      >
        {question.question}
      </p>
      {isShortAnswer(question) && short ? (
        <ShortResult question={question} short={short} />
      ) : (
      <dl className="mt-3 flex flex-col gap-1 text-[0.9375rem]">
        <div className="flex gap-2">
          <dt className="text-text-secondary">Your answer:</dt>
          <dd className={given === question.correctIndex ? "text-success" : "text-error"}>
            {given === undefined ? (
              <span className="text-text-tertiary">Left blank</span>
            ) : (
              <>
                <span aria-hidden="true">{given === question.correctIndex ? "✓ " : "✕ "}</span>
                {optionLetter(given)}. {question.options[given]}
              </>
            )}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-text-secondary">Correct answer:</dt>
          <dd className="text-success">
            {optionLetter(question.correctIndex)}. {question.options[question.correctIndex]}
          </dd>
        </div>
      </dl>
      )}
      {question.explanation && (
        <p className="mt-2 text-[0.875rem] leading-relaxed text-text-secondary">
          {question.explanation}
        </p>
      )}
      {question.whyOthersWrong && (
        <p className="mt-2 text-[0.875rem] leading-relaxed text-text-secondary">
          {question.whyOthersWrong}
        </p>
      )}
    </>
  );
}

// Every question in a set shares one listing, so the listing is shown once with
// all of the set's results stacked under it — repeating a 30-line program for
// each blank buried the results between copies of the same code.
function GroupBlock({
  group,
  numbering,
  answers,
  outcome,
}: {
  group: QuestionGroup;
  numbering: Map<string, number>;
  answers: Answers;
  outcome: string;
}) {
  const [open, setOpen] = useState(false);
  const count = group.questions.length;
  const noun = group.questions[0].type === "code" ? "blank" : "question";

  return (
    <div className="border-t border-border py-5 last:border-b">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="-mx-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-text-secondary hover:bg-surface-alt hover:text-text-primary"
      >
        <Chevron open={open} />
        <span className="text-[0.9375rem] font-semibold text-text-primary">
          {group.title || (group.questions[0].type === "code" ? "The program" : "The problem")}
        </span>
        <span className="text-[0.875rem]">
          — {count} {noun}
          {count === 1 ? "" : "s"} {outcome}
        </span>
      </button>

      {open && <StimulusBlock stimulus={group.stimulus!} />}

      <div className="mt-4 flex flex-col">
        {group.questions.map((question, index) => (
          <div
            key={question.id}
            className={index > 0 ? "mt-4 border-t border-dashed border-border pt-4" : ""}
          >
            <ResultRow
              question={question}
              number={numbering.get(question.id) ?? 0}
              answers={answers}
              inGroup
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultList({
  questions,
  numbering,
  answers,
  outcome,
  format,
  short,
}: {
  questions: Question[];
  numbering: Map<string, number>;
  answers: Answers;
  outcome: string;
  format: ExamFormat;
  short?: ShortContext;
}) {
  // Filtering preserves order, so questions from one set stay contiguous and
  // still collapse into a single group here.
  const groups = groupQuestions(questions);

  return (
    <div className="mt-3 flex flex-col">
      {groups.map((group) =>
        // Same call as the quiz and edit screens: only a mono-kind stimulus
        // earns the collapsible problem block. Prose goes to the row.
        group.stimulus && isMonoKind(stimulusKindOf(format, group.questions[0].type)) ? (
          <GroupBlock
            key={group.key}
            group={group}
            numbering={numbering}
            answers={answers}
            outcome={outcome}
          />
        ) : (
          <div key={group.key} className="border-t border-border py-5 last:border-b">
            <ResultRow
              question={group.questions[0]}
              number={numbering.get(group.questions[0].id) ?? 0}
              answers={answers}
              inGroup={false}
              short={short}
            />
          </div>
        ),
      )}
    </div>
  );
}

export default function QuizResults({
  reviewerId,
  reviewerName,
  format,
  questions,
  answers,
  textAnswers = {},
  grades = {},
  onOverride,
  onGradeNow,
  unsureIds,
  takenAt,
  durationSec,
  timedOut,
  onRetake,
  onBack,
}: {
  reviewerId: string;
  reviewerName: string;
  // The format the attempt was taken under: breakdown cards and missed-type
  // filters read order and labels from it.
  format: ExamFormat;
  questions: Question[];
  answers: Answers;
  // Typed answers and their grades, for attempts with short-answer questions.
  textAnswers?: Record<string, string>;
  grades?: Record<string, ShortGrade>;
  // Writes a by-hand override to the saved attempt. Omitted when there is no
  // saved attempt to write to.
  onOverride?: (questionId: string, credit: 0 | 1) => void;
  // Retries grading for short answers that were saved ungraded. Resolves to an
  // error message, or null on success.
  onGradeNow?: () => Promise<string | null>;
  unsureIds: string[];
  // Both set only when reopening a past attempt from the history list, so the
  // screen says which attempt this is and can get back to that list.
  takenAt?: string;
  // Wall-clock seconds from quiz start to submit, plus whether the countdown
  // forced the submit. Omitted (or zero) for attempts recorded before timing
  // existed — the line simply doesn't render for those.
  durationSec?: number;
  timedOut?: boolean;
  onRetake: () => void;
  onBack?: () => void;
}) {
  const [missedType, setMissedType] = useState<"all" | string>("all");

  const numbering = useMemo(() => new Map(questions.map((q, i) => [q.id, i + 1])), [questions]);
  const [gradeBusy, setGradeBusy] = useState(false);
  const [gradeError, setGradeError] = useState("");

  // Full credit is "correct"; a partly covered short answer lands in
  // Incorrect but still adds its share to the score below.
  const missed = questions.filter((q) => !isFullCredit(q, answers, grades));
  const correct = questions.filter((q) => isFullCredit(q, answers, grades));
  const unsure = questions.filter((q) => unsureIds.includes(q.id));
  const score = sumCredit(questions, answers, grades);
  const shortContext: ShortContext | undefined = questions.some(isShortAnswer)
    ? { textAnswers, grades, onOverride }
    : undefined;
  const ungradedCount = questions.filter(
    (q) => isShortAnswer(q) && (!grades[q.id] || grades[q.id].ungraded === true),
  ).length;

  async function handleGradeNow() {
    if (!onGradeNow) return;
    setGradeBusy(true);
    setGradeError("");
    const error = await onGradeNow();
    if (error) setGradeError(error);
    setGradeBusy(false);
  }
  const percent = questions.length === 0 ? 0 : Math.round((score / questions.length) * 100);

  // Which types actually appeared, so a quiz scoped to one type doesn't show
  // three empty cards — or a filter row with nothing to filter.
  const typesPresent = formatTypeKeys(format).filter((t) => questions.some((q) => q.type === t));
  const missedTypes = formatTypeKeys(format).filter((t) => missed.some((q) => q.type === t));
  const visibleMissed =
    missedType === "all" ? missed : missed.filter((q) => q.type === missedType);

  return (
    <div className="flex flex-col">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="self-start text-[0.9375rem] text-text-secondary hover:text-text-primary"
        >
          ← Your attempts
        </button>
      ) : (
        <Link
          href={`/reviewer/${reviewerId}`}
          className="self-start text-[0.9375rem] text-text-secondary hover:text-text-primary"
        >
          ← {reviewerName}
        </Link>
      )}

      <h1 className="mt-4 text-[1.625rem] font-semibold text-text-primary">Quiz results</h1>
      <p className="mt-1 text-[0.9375rem] text-text-secondary">
        {reviewerName}
        {takenAt &&
          ` · taken ${new Date(takenAt).toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}`}
      </p>

      <p className={`mt-6 text-[2.125rem] font-bold tracking-tight ${scoreTone(percent)}`}>
        {formatScore(score)}/{questions.length}
        <span className="ml-2 text-[1.1875rem] font-medium">({percent}%)</span>
      </p>
      {durationSec ? (
        <p className="mt-1 text-[0.9375rem] text-text-secondary">
          {timedOut ? "Time ran out — submitted automatically" : "Finished"} in{" "}
          {formatCountdown(durationSec)}
        </p>
      ) : null}

      {ungradedCount > 0 && onGradeNow && (
        <div
          role="status"
          className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-warning bg-warning-subtle px-4 py-3 text-[0.9375rem] text-text-primary"
        >
          <span className="min-w-0 flex-1">
            {ungradedCount} short answer{ungradedCount === 1 ? " was" : "s were"} saved without a grade, so
            {ungradedCount === 1 ? " it counts" : " they count"} as zero for now.
            {gradeError && <span className="ml-1 text-error">{gradeError}</span>}
          </span>
          <button
            type="button"
            onClick={handleGradeNow}
            disabled={gradeBusy}
            className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-[0.875rem] font-medium text-on-accent enabled:hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {gradeBusy ? "Grading…" : "Grade now"}
          </button>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {typesPresent.map((type) => {
          const ofType = questions.filter((q) => q.type === type);
          const right = sumCredit(ofType, answers, grades);
          return (
            <div
              key={type}
              className="min-w-[124px] rounded-lg border border-border bg-surface-alt px-3.5 py-2.5"
            >
              <p className="font-mono text-[0.75rem] tracking-wide text-text-tertiary uppercase">
                {typeLabelOf(format, type)}
              </p>
              <p className="mt-1 text-[1.1875rem] font-semibold text-text-primary">
                {formatScore(right)}
                <span className="text-text-secondary">/{ofType.length}</span>
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-center">
        <button
          onClick={onRetake}
          className="rounded-lg bg-accent px-4 py-2.5 text-[0.9375rem] font-medium text-on-accent hover:bg-accent-hover"
        >
          Retake quiz
        </button>
      </div>

      <CollapsibleSection title="Incorrect" count={missed.length} defaultOpen>
        {missed.length === 0 ? (
          <p className="mt-2 text-[0.9375rem] text-success">
            Nothing missed — you got every question right.
          </p>
        ) : (
          <>
            {missedTypes.length > 1 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-alt px-4 py-3">
                <span className="text-[0.875rem] text-text-secondary">Type</span>
                {(["all", ...missedTypes] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setMissedType(t)}
                    className={`rounded-lg px-2.5 py-1 text-[0.875rem] font-medium ${
                      missedType === t
                        ? "bg-accent text-on-accent"
                        : "border border-border-strong text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {t === "all" ? "All" : typeLabelOf(format, t)}
                  </button>
                ))}
                <span className="ml-auto text-[0.875rem] text-text-tertiary">
                  {visibleMissed.length} shown
                </span>
              </div>
            )}
            <ResultList
              questions={visibleMissed}
              numbering={numbering}
              answers={answers}
              outcome="incorrect"
              format={format}
              short={shortContext}
            />
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Correct" count={correct.length}>
        {correct.length === 0 ? (
          <p className="mt-2 text-[0.9375rem] text-text-secondary">
            You didn&apos;t get any questions right this attempt.
          </p>
        ) : (
          <ResultList
            questions={correct}
            numbering={numbering}
            answers={answers}
            outcome="correct"
            format={format}
            short={shortContext}
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Marked unsure" count={unsure.length} defaultOpen>
        <p className="mt-1 text-[0.875rem] text-text-secondary">
          Questions you flagged as unsure during the quiz, regardless of whether you got them
          right.
        </p>
        {unsure.length === 0 ? (
          <p className="mt-2 text-[0.9375rem] text-text-secondary">
            You didn&apos;t flag any questions this attempt.
          </p>
        ) : (
          <ResultList
            questions={unsure}
            numbering={numbering}
            answers={answers}
            outcome="flagged"
            format={format}
            short={shortContext}
          />
        )}
      </CollapsibleSection>
    </div>
  );
}
