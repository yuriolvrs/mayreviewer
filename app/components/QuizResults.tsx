"use client";

import Link from "next/link";
import { isPreformatted, optionLetter } from "@/app/lib/questions";
import type { Question } from "@/app/types";
import type { Answers } from "@/app/components/QuizTaking";

function QuestionCard({
  question,
  number,
  answers,
}: {
  question: Question;
  number: number;
  answers: Answers;
}) {
  const given = answers[question.id];

  return (
    <li className="border-t border-border py-5 last:border-b">
      <span className="font-mono text-[13px] text-text-tertiary">Question {number}</span>
      {/* Missed questions are listed on their own, out of set order, so a set
          question has to bring its problem with it or it can't be re-read. */}
      {question.stimulus && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[14px] text-text-secondary hover:text-text-primary">
            {question.groupTitle || "Show the problem"}
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface-alt p-4 font-mono text-[14px] leading-relaxed text-text-primary">
            {question.stimulus}
          </pre>
        </details>
      )}
      <p
        className={`mt-2 text-[15px] leading-relaxed whitespace-pre-wrap text-text-primary ${
          isPreformatted(question.type) && !question.stimulus ? "font-mono" : ""
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
    </li>
  );
}

export default function QuizResults({
  reviewerId,
  reviewerName,
  questions,
  answers,
  unsureIds,
  onRetake,
}: {
  reviewerId: string;
  reviewerName: string;
  questions: Question[];
  answers: Answers;
  unsureIds: string[];
  onRetake: () => void;
}) {
  const numbering = new Map(questions.map((q, i) => [q.id, i + 1]));
  const missed = questions.filter((q) => answers[q.id] !== q.correctIndex);
  const unsure = questions.filter((q) => unsureIds.includes(q.id));
  const score = questions.length - missed.length;
  const percent = questions.length === 0 ? 0 : Math.round((score / questions.length) * 100);

  return (
    <div className="flex flex-col">
      <h1 className="text-[26px] font-semibold text-text-primary">Quiz results</h1>
      <p className="mt-1 text-[15px] text-text-secondary">{reviewerName}</p>

      <p className="mt-6 text-[34px] font-bold tracking-tight text-text-primary">
        {score}/{questions.length}
        <span className="ml-2 text-[19px] font-medium text-text-secondary">({percent}%)</span>
      </p>

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

      <section className="mt-10">
        <h2 className="text-[19px] font-semibold text-text-primary">
          Missed {missed.length > 0 && <span className="text-text-secondary">({missed.length})</span>}
        </h2>
        {missed.length === 0 ? (
          <p className="mt-2 text-[15px] text-success">
            Nothing missed — you got every question right.
          </p>
        ) : (
          <ol className="mt-3 flex flex-col">
            {missed.map((question) => (
              <QuestionCard
                key={question.id}
                question={question}
                number={numbering.get(question.id) ?? 0}
                answers={answers}
              />
            ))}
          </ol>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-[19px] font-semibold text-text-primary">
          Marked unsure {unsure.length > 0 && <span className="text-text-secondary">({unsure.length})</span>}
        </h2>
        <p className="mt-1 text-[14px] text-text-secondary">
          Shown even where you answered correctly — a lucky guess is still worth rereading.
        </p>
        {unsure.length === 0 ? (
          <p className="mt-2 text-[15px] text-text-secondary">
            You didn&apos;t flag any questions this attempt.
          </p>
        ) : (
          <ol className="mt-3 flex flex-col">
            {unsure.map((question) => (
              <QuestionCard
                key={question.id}
                question={question}
                number={numbering.get(question.id) ?? 0}
                answers={answers}
              />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
