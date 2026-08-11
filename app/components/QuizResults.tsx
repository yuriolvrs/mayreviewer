"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  QUESTION_TYPES,
  TYPE_LABELS,
  groupQuestions,
  isPreformatted,
  optionLetter,
  scoreTone,
} from "@/app/lib/questions";
import StimulusBlock from "@/app/components/StimulusBlock";
import type { QuestionGroup } from "@/app/lib/questions";
import type { Question, QuestionType } from "@/app/types";
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
          className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1 text-[19px] font-semibold text-text-secondary hover:bg-surface-alt hover:text-text-primary"
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

function ResultRow({
  question,
  number,
  answers,
  inGroup,
}: {
  question: Question;
  number: number;
  answers: Answers;
  inGroup: boolean;
}) {
  const given = answers[question.id];

  return (
    <>
      <span className="font-mono text-[14px] font-bold text-text-primary">{number}.</span>
      <p
        className={`mt-2 text-[15px] leading-relaxed whitespace-pre-wrap text-text-primary ${
          // A set's listing lives in the shared block above, so only a
          // standalone Timeline/Code question carries preformatted text itself.
          isPreformatted(question.type) && !inGroup ? "font-mono" : ""
        }`}
      >
        {question.question}
      </p>
      <dl className="mt-3 flex flex-col gap-1 text-[15px]">
        <div className="flex gap-2">
          <dt className="text-text-secondary">Your answer:</dt>
          <dd className={given === question.correctIndex ? "text-success" : "text-error"}>
            {given === undefined ? (
              <span className="text-text-tertiary">Left blank</span>
            ) : (
              `${optionLetter(given)}. ${question.options[given]}`
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
      {question.explanation && (
        <p className="mt-2 text-[14px] leading-relaxed text-text-secondary">
          {question.explanation}
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
        <span className="text-[15px] font-semibold text-text-primary">
          {group.title || (group.questions[0].type === "code" ? "The program" : "The problem")}
        </span>
        <span className="text-[14px]">
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
}: {
  questions: Question[];
  numbering: Map<string, number>;
  answers: Answers;
  outcome: string;
}) {
  // Filtering preserves order, so questions from one set stay contiguous and
  // still collapse into a single group here.
  const groups = groupQuestions(questions);

  return (
    <div className="mt-3 flex flex-col">
      {groups.map((group) =>
        group.stimulus ? (
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
  questions,
  answers,
  unsureIds,
  takenAt,
  onRetake,
  onBack,
}: {
  reviewerId: string;
  reviewerName: string;
  questions: Question[];
  answers: Answers;
  unsureIds: string[];
  // Both set only when reopening a past attempt from the history list, so the
  // screen says which attempt this is and can get back to that list.
  takenAt?: string;
  onRetake: () => void;
  onBack?: () => void;
}) {
  const [missedType, setMissedType] = useState<"all" | QuestionType>("all");

  const numbering = new Map(questions.map((q, i) => [q.id, i + 1]));
  const missed = questions.filter((q) => answers[q.id] !== q.correctIndex);
  const correct = questions.filter((q) => answers[q.id] === q.correctIndex);
  const unsure = questions.filter((q) => unsureIds.includes(q.id));
  const score = correct.length;
  const percent = questions.length === 0 ? 0 : Math.round((score / questions.length) * 100);

  // Which types actually appeared, so a quiz scoped to one type doesn't show
  // three empty cards — or a filter row with nothing to filter.
  const typesPresent = QUESTION_TYPES.filter((t) => questions.some((q) => q.type === t));
  const missedTypes = QUESTION_TYPES.filter((t) => missed.some((q) => q.type === t));
  const visibleMissed =
    missedType === "all" ? missed : missed.filter((q) => q.type === missedType);

  return (
    <div className="flex flex-col">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="self-start text-[15px] text-text-secondary hover:text-text-primary"
        >
          ← Your attempts
        </button>
      )}

      <h1 className={`text-[26px] font-semibold text-text-primary ${onBack ? "mt-4" : ""}`}>
        Quiz results
      </h1>
      <p className="mt-1 text-[15px] text-text-secondary">
        {reviewerName}
        {takenAt && ` · taken ${new Date(takenAt).toLocaleString()}`}
      </p>

      <p className={`mt-6 text-[34px] font-bold tracking-tight ${scoreTone(percent)}`}>
        {score}/{questions.length}
        <span className="ml-2 text-[19px] font-medium">({percent}%)</span>
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        {typesPresent.map((type) => {
          const ofType = questions.filter((q) => q.type === type);
          const right = ofType.filter((q) => answers[q.id] === q.correctIndex).length;
          return (
            <div
              key={type}
              className="min-w-[124px] rounded-lg border border-border bg-surface-alt px-3.5 py-2.5"
            >
              <p className="font-mono text-[12px] tracking-wide text-text-tertiary uppercase">
                {TYPE_LABELS[type]}
              </p>
              <p className="mt-1 text-[19px] font-semibold text-text-primary">
                {right}
                <span className="text-text-secondary">/{ofType.length}</span>
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={onRetake}
          className="rounded-lg bg-accent px-4 py-2.5 text-[15px] font-medium text-white hover:bg-accent-hover"
        >
          Retake quiz
        </button>
        <Link
          href={`/reviewer/${reviewerId}`}
          className="rounded-lg border border-border px-4 py-2.5 text-[15px] font-medium text-text-primary hover:border-border-strong"
        >
          Back to reviewer
        </Link>
      </div>

      <CollapsibleSection title="Incorrect" count={missed.length} defaultOpen>
        {missed.length === 0 ? (
          <p className="mt-2 text-[15px] text-success">
            Nothing missed — you got every question right.
          </p>
        ) : (
          <>
            {missedTypes.length > 1 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-alt px-4 py-3">
                <span className="text-[14px] text-text-secondary">Type</span>
                {(["all", ...missedTypes] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setMissedType(t)}
                    className={`rounded-lg px-2.5 py-1 text-[14px] font-medium ${
                      missedType === t
                        ? "bg-accent text-white"
                        : "border border-border-strong text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {t === "all" ? "All" : TYPE_LABELS[t]}
                  </button>
                ))}
                <span className="ml-auto text-[14px] text-text-tertiary">
                  {visibleMissed.length} shown
                </span>
              </div>
            )}
            <ResultList
              questions={visibleMissed}
              numbering={numbering}
              answers={answers}
              outcome="incorrect"
            />
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Correct" count={correct.length}>
        {correct.length === 0 ? (
          <p className="mt-2 text-[15px] text-text-secondary">
            You didn&apos;t get any questions right this attempt.
          </p>
        ) : (
          <ResultList
            questions={correct}
            numbering={numbering}
            answers={answers}
            outcome="correct"
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Marked unsure" count={unsure.length} defaultOpen>
        <p className="mt-1 text-[14px] text-text-secondary">
          Questions you flagged as unsure during the quiz, regardless of whether you got them
          right.
        </p>
        {unsure.length === 0 ? (
          <p className="mt-2 text-[15px] text-text-secondary">
            You didn&apos;t flag any questions this attempt.
          </p>
        ) : (
          <ResultList
            questions={unsure}
            numbering={numbering}
            answers={answers}
            outcome="flagged"
          />
        )}
      </CollapsibleSection>
    </div>
  );
}
