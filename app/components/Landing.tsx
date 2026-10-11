"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

// First-time visitor landing on "/". The brand line opens as a real group-chat
// message; the reply's attachment is a sample practice exam the visitor can
// answer, with a Score line that fills as they go. Hidden by CSS for
// returning visitors (see EntryScript); the reviewers home mounts instead.

type Item = {
  id: string;
  test: string;
  format: string;
  directions: string;
  prompt: ReactNode;
  options: string[];
  correct: number;
  why: string;
};

const TIMELINE: Item = {
  id: "experiment",
  test: "Test I",
  format: "Experiment trace",
  directions: "Use the table. Choose the conclusion it supports.",
  prompt: (
    <>
      <table className="mb-3 w-full border-collapse text-[0.875rem]">
        <thead>
          <tr className="bg-surface-alt text-left text-text-secondary">
            <th className="px-3 py-2 font-normal">Water temp (°C)</th>
            <th className="px-3 py-2 font-normal">Time to dissolve (s)</th>
          </tr>
        </thead>
        <tbody>
          {[
            [20, 90],
            [40, 55],
            [60, 30],
          ].map(([temp, time]) => (
            <tr key={temp} className="border-b border-border">
              <td className="px-3 py-2 tabular-nums">{temp}</td>
              <td className="px-3 py-2 tabular-nums">{time}</td>
            </tr>
          ))}
        </tbody>
      </table>
      A spoon of sugar is stirred into water at three temperatures. As the water gets warmer, the time to dissolve…
    </>
  ),
  options: ["Goes up", "Goes down", "Stays the same", "Shows no pattern"],
  correct: 1,
  why: "90 s, then 55 s, then 30 s: warmer water dissolves the sugar faster.",
};

const MORE: Item[] = [
  {
    id: "vocabulary",
    test: "Test II",
    format: "Vocabulary",
    directions: "Choose the word or phrase closest in meaning.",
    prompt: (
      <>
        She checked every line of her report in a <span className="font-semibold">meticulous</span> way.
      </>
    ),
    options: ["Careless", "Very careful", "Hurried", "Generous"],
    correct: 1,
    why: "Meticulous means showing great attention to detail: very careful.",
  },
  {
    id: "cause",
    test: "Test III",
    format: "Cause and effect",
    directions: "Choose the most direct effect.",
    prompt: "Gutenberg's printing press spread across Europe in the late 1400s. What did it lead to most directly?",
    options: [
      "Paper was invented",
      "Books got cheaper and ideas spread faster",
      "Fewer people learned to read",
      "Handwritten books became more common",
    ],
    correct: 1,
    why: "Printing made books faster and cheaper to produce, so more people could get them and ideas traveled further.",
  },
  {
    id: "solve",
    test: "Test IV",
    format: "Solve and pick the value",
    directions: "Solve, then choose the value.",
    prompt: (
      <>
        If <span className="tabular-nums">3x + 5 = 20</span>, what is <span className="italic">x</span>?
      </>
    ),
    options: ["3", "5", "15", "25"],
    correct: 1,
    why: "Subtract 5 from both sides to get 3x = 15, then divide by 3: x = 5.",
  },
  {
    id: "mtf",
    test: "Test V",
    format: "Modified true or false",
    directions: "If false, choose the value that makes it true.",
    prompt: (
      <>
        At sea level, pure water boils at{" "}
        <span className="underline decoration-2 underline-offset-4">50</span> °C.
      </>
    ),
    options: ["True", "False: 80", "False: 100", "False: 120"],
    correct: 2,
    why: "At sea level, pure water boils at 100 °C.",
  },
];

const TOTAL = 1 + MORE.length;
const LETTERS = ["A", "B", "C", "D"];

function Question({
  item,
  picked,
  onPick,
  first = false,
}: {
  item: Item;
  picked: number | undefined;
  onPick: (choice: number) => void;
  first?: boolean;
}) {
  const answered = picked !== undefined;
  return (
    <section aria-labelledby={`q-${item.id}`} className={`py-7 ${first ? "pt-4" : "border-t border-border"}`}>
      <h3 id={`q-${item.id}`} className="text-[0.8125rem] font-semibold tracking-wide text-text-primary uppercase">
        {item.test}. {item.format}
      </h3>
      <p className="mt-1 text-[0.875rem] text-text-secondary">
        <span className="italic">Directions:</span> {item.directions}
      </p>
      <div className="mt-4 text-[1.0625rem] leading-relaxed text-text-primary">{item.prompt}</div>
      <div role="group" aria-label={`${item.test} choices`} className="mt-4 grid gap-2 sm:grid-cols-2">
        {item.options.map((option, i) => {
          const isCorrect = i === item.correct;
          const isPicked = i === picked;
          let tone = "border-border bg-surface hover:border-border-strong";
          let note: string | null = null;
          if (answered && isCorrect) {
            tone = "border-success bg-success-subtle";
            note = "Correct";
          } else if (answered && isPicked) {
            tone = "border-error bg-error-subtle";
            note = "Your answer";
          } else if (answered) {
            tone = "border-border bg-surface opacity-60";
          }
          return (
            <button
              key={option}
              type="button"
              disabled={answered}
              onClick={() => onPick(i)}
              aria-pressed={isPicked}
              className={`flex min-h-12 items-center gap-3 rounded-lg border px-4 py-3 text-left text-[0.9375rem] transition-colors duration-150 disabled:cursor-default ${tone}`}
            >
              <span className="text-[0.8125rem] text-text-secondary tabular-nums">{LETTERS[i]}.</span>
              <span className="flex-1">{option}</span>
              {note && (
                <span
                  className={`text-[0.8125rem] font-semibold ${isCorrect ? "text-success" : "text-error"}`}
                >
                  {note}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {answered && (
        <p role="status" className="mt-3 text-[0.875rem] leading-relaxed text-text-secondary">
          {item.why}
        </p>
      )}
    </section>
  );
}

function Bubble({ from, children, delay }: { from: "them" | "me"; children: ReactNode; delay: string }) {
  return (
    <p
      style={{ animationDelay: delay }}
      className={`landing-rise max-w-[80%] rounded-lg px-4 py-2.5 text-[1.0625rem] leading-snug ${
        from === "me"
          ? "self-end bg-accent text-on-accent"
          : "self-start border border-border bg-surface text-text-primary"
      }`}
    >
      {children}
    </p>
  );
}

export default function Landing() {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const all = [TIMELINE, ...MORE];
  const answeredCount = Object.keys(answers).length;
  const score = all.filter((item) => answers[item.id] === item.correct).length;
  const pick = (id: string) => (choice: number) => setAnswers((prev) => ({ ...prev, [id]: choice }));

  return (
    <div className="landing mx-auto w-full max-w-[760px] px-4 pt-6 pb-16 md:pt-12">
      <div className="flex flex-col gap-2" aria-label="A message thread">
        <p className="mb-1 self-center text-[0.8125rem] text-text-secondary">Thu 11:42 PM · finals tomorrow</p>
        <Bubble from="them" delay="0ms">pre, may reviewer ka ba?</Bubble>
        <Bubble from="me" delay="350ms">meron, eto oh</Bubble>
      </div>

      <article
        style={{ animationDelay: "650ms" }}
        className="landing-rise mt-3 rounded-lg border border-border bg-surface"
      >
        <div className="sticky top-0 z-10 flex items-baseline justify-between gap-4 rounded-t-lg border-b border-text-primary bg-surface px-5 py-3 text-[0.8125rem] md:px-10">
          <span className="text-text-secondary">
            Name <span className="inline-block w-24 border-b border-text-tertiary align-baseline md:w-40" />
          </span>
          <span className="text-text-secondary" aria-live="polite">
            Score{" "}
            <span className="font-semibold text-text-primary tabular-nums">
              {answeredCount === 0 ? "___" : score}
            </span>{" "}
            / {TOTAL}
            {answeredCount === TOTAL && <span className="font-semibold text-text-primary"> · Checked</span>}
          </span>
        </div>

        <div className="px-5 md:px-10">
          <h1 className="pt-7 text-[clamp(2.5rem,9vw,4.5rem)] leading-[0.98] font-extrabold tracking-[-0.035em] text-balance text-text-primary">
            Your notes, as a practice exam.
          </h1>
          <p className="mt-4 max-w-[34rem] text-[1.0625rem] leading-relaxed text-text-secondary">
            Paste or upload your notes or an old exam. May Reviewer writes practice questions you can answer,
            check, and drill before the real one.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 pb-8">
            <Link
              href="/reviewer/new"
              className="rounded-lg bg-accent px-5 py-3.5 text-[1rem] font-semibold text-on-accent hover:bg-accent-hover"
            >
              Make my reviewer, free
            </Link>
            <span className="text-[0.875rem] text-text-secondary">No account needed.</span>
          </div>

          <p className="border-t border-border pt-5 text-[0.8125rem] text-text-secondary">
            Sample paper, mixed subjects. Yours is made from your own notes.
          </p>
          <Question item={TIMELINE} picked={answers[TIMELINE.id]} onPick={pick(TIMELINE.id)} first />
          {MORE.map((item) => (
            <Question key={item.id} item={item} picked={answers[item.id]} onPick={pick(item.id)} />
          ))}

          <section aria-labelledby="directions" className="border-t border-text-primary py-8">
            <h2 id="directions" className="text-[1.625rem] font-bold tracking-tight text-text-primary">
              General directions
            </h2>
            <ol className="mt-5 flex flex-col gap-5">
              {[
                ["Bring your material.", "Paste notes or upload PDFs, Word files, images, or text. Slides work saved as PDF. Add an old exam if you have one."],
                ["Match your class's format.", "Pick a built-in format (Math, Language, Science, History, and more). Have an old exam? Build a format from it, so practice asks the way your teacher does."],
                ["Check every question.", "AI can be wrong. Edit, delete, or regenerate any item before you study from it."],
                ["Drill it daily.", "Timed quizzes, a daily goal, and a streak. Quizzes work offline."],
              ].map(([title, body], i) => (
                <li key={title} className="flex gap-4">
                  <span className="w-6 flex-none pt-0.5 text-[1.0625rem] font-bold text-text-primary tabular-nums">{i + 1}.</span>
                  <span>
                    <span className="block text-[1.0625rem] font-semibold text-text-primary">{title}</span>
                    <span className="mt-1 block text-[0.9375rem] leading-relaxed text-text-secondary">{body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </article>

      <div className="mt-10 flex flex-col gap-2">
        <Bubble from="them" delay="0ms">
          {answeredCount === TOTAL ? `${score}/${TOTAL} ako dun pre. pano mo ginawa yan?` : "pano mo ginawa yan?"}
        </Bubble>
        <Bubble from="me" delay="0ms">gawa ka rin, libre lang</Bubble>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Link
          href="/reviewer/new"
          className="rounded-lg bg-accent px-5 py-3.5 text-[1rem] font-semibold text-on-accent hover:bg-accent-hover"
        >
          Make my reviewer, free
        </Link>
        <Link href="/login" className="py-3 text-[0.9375rem] font-medium text-text-secondary hover:text-text-primary">
          I have an account
        </Link>
      </div>
      <p className="mt-4 max-w-[34rem] text-[0.875rem] leading-relaxed text-text-secondary">
        Free, with no paid tier. No account needed: your reviewers stay on your device, and you sign in only to
        sync them.
      </p>

    </div>
  );
}
