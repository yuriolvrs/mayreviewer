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
  mono?: boolean;
};

const TIMELINE: Item = {
  id: "timeline",
  test: "Test I",
  format: "Timeline",
  directions: "Use the table. Choose the process running at the given time.",
  prompt: (
    <>
      <table className="mb-3 w-full border-collapse font-mono text-[0.875rem]">
        <thead>
          <tr className="bg-surface-alt text-left text-text-secondary">
            <th className="px-3 py-2 font-normal">Process</th>
            <th className="px-3 py-2 font-normal">Arrival</th>
            <th className="px-3 py-2 font-normal">Burst</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["P1", 0, 3],
            ["P2", 1, 2],
            ["P3", 2, 4],
          ].map(([p, a, b]) => (
            <tr key={p} className="border-b border-border">
              <td className="px-3 py-2">{p}</td>
              <td className="px-3 py-2 tabular-nums">{a}</td>
              <td className="px-3 py-2 tabular-nums">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      Under FCFS, which process is running at <span className="tabular-nums">t = 4</span>?
    </>
  ),
  options: ["P1", "P2", "P3", "Idle"],
  correct: 1,
  why: "P1 runs 0–3, then P2 runs 3–5. At t = 4 it's P2.",
};

const MORE: Item[] = [
  {
    id: "identification",
    test: "Test II",
    format: "Identification",
    directions: "Choose the term being described.",
    prompt:
      "The OS keeps one for every process: its state, program counter, registers, and open files.",
    options: ["Page table", "Process control block", "Ready queue", "Interrupt vector"],
    correct: 1,
    why: "The process control block (PCB) holds everything the OS needs to pause and resume a process.",
  },
  {
    id: "scenario",
    test: "Test III",
    format: "Scenario",
    directions: "Choose the concept the situation shows.",
    prompt:
      "Two processes each hold a printer and wait for the other's scanner. Neither can ever continue.",
    options: ["Starvation", "Race condition", "Deadlock", "Thrashing"],
    correct: 2,
    why: "Each holds one resource and waits for the other's: a circular wait, so a deadlock.",
  },
  {
    id: "code",
    test: "Test IV",
    format: "Code fill-in-the-blank",
    directions: "Choose the call that belongs in the blank.",
    prompt: (
      <pre className="overflow-x-auto rounded-lg bg-surface-alt p-4 font-mono text-[0.875rem] leading-[1.375rem]">
        {"sem_t lock;\nsem_init(&lock, 0, 1);\n\n"}
        <span aria-label="blank" className="inline-block w-20 border-b-2 border-text-primary align-baseline" />
        {"(&lock);  // enter\nbalance += amount;\nsem_post(&lock);  // leave"}
      </pre>
    ),
    options: ["sem_post", "sem_wait", "sem_init", "pthread_join"],
    correct: 1,
    why: "sem_wait takes the lock before the critical section; sem_post gives it back after.",
    mono: true,
  },
  {
    id: "mtf",
    test: "Test V",
    format: "Modified true or false",
    directions: "If false, choose the word that makes it true.",
    prompt: (
      <>
        In paging, physical memory is split into fixed-size blocks called{" "}
        <span className="underline decoration-2 underline-offset-4">segments</span>.
      </>
    ),
    options: ["True", "False: pages", "False: frames", "False: sectors"],
    correct: 2,
    why: "Physical memory is split into frames. Pages are the same-size blocks of a process's logical memory.",
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
              <span className={`flex-1 ${item.mono ? "font-mono" : ""}`}>{option}</span>
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
            Your notes, as your prof&apos;s exam.
          </h1>
          <p className="mt-4 max-w-[34rem] text-[1.0625rem] leading-relaxed text-text-secondary">
            Paste or upload your notes or an old exam. May Reviewer writes practice questions in the same
            format your professor uses, so you can drill them before the real one.
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
            Sample paper. Yours is made from your own notes.
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
                ["Pick your prof's format.", "Start from a built-in format (OS, Math, Language, Science, History) or let it read an old exam and copy the format."],
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
