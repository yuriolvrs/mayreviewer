import type { AnswerFormat, ExamFormat, FormatTypeDef, StimulusKind } from "@/app/lib/examFormats";

export const ANSWER_FORMAT_LABEL: Record<AnswerFormat, string> = {
  mc: "Multiple choice",
  "true-false": "True / False",
  "modified-tf": "Modified True/False",
  "short-answer": "Short answer",
};

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

const DIRECTIONS: Record<AnswerFormat, string> = {
  mc: "Choose the letter of the best answer.",
  "true-false": "Choose True if the statement is correct, False if it is not.",
  "modified-tf": "Read the statements, then choose the option that matches.",
  "short-answer": "Answer in one to three sentences.",
};

const PROMPT: Record<AnswerFormat, string> = {
  mc: "A sample question is written here, with one best answer.",
  "true-false": "A sample statement is written here. It is either correct or not.",
  "modified-tf": "Statement I is written here. Statement II is written here.",
  "short-answer": "A sample question is written here. Answer it in your own words.",
};

const OPTIONS: Record<AnswerFormat, string[]> = {
  mc: ["The correct answer", "A close wrong answer", "Another wrong answer", "A third wrong answer"],
  "true-false": ["True", "False"],
  "modified-tf": ["Statement I only is correct", "Statement II only is correct", "Both are correct", "Neither is correct"],
  "short-answer": [],
};

const STIMULUS_BLOCK: Record<Exclude<StimulusKind, "none">, string> = {
  prose: "A short passage that the questions refer to is printed here.",
  table: "Step | Event\n1    | First thing happens\n2    | Next thing happens",
  code: "total = 0\nfor i in range(3):\n    total += ____",
  formula: "f(x) = ax + b\nGiven a = 2 and b = 3, find f(4).",
};

const MATERIAL_HINT: Record<StimulusKind, string> = {
  none: "no attached material",
  prose: "a passage",
  table: "a table",
  code: "a code listing",
  formula: "a formula",
};

function typeHint(t: FormatTypeDef): string {
  if (t.guidance?.trim()) return t.guidance.trim();
  if (t.format === "short-answer") return "Typed answers, graded by AI against key points.";
  const layout = t.shape === "set" ? "A problem set that shares" : "Single questions with";
  return `${layout} ${MATERIAL_HINT[t.stimulus]}.`;
}

function SampleQuestion({ type }: { type: FormatTypeDef }) {
  const options = OPTIONS[type.format];
  const mono = type.stimulus === "table" || type.stimulus === "code" || type.stimulus === "formula";
  return (
    <div className="mt-3">
      <p className="text-[0.875rem] italic text-text-secondary">
        Directions: {DIRECTIONS[type.format]}
      </p>
      {type.stimulus !== "none" && type.format !== "short-answer" && (
        <pre
          className={`mt-3 overflow-x-auto rounded-lg bg-surface-alt px-3 py-2 text-[0.875rem] leading-[1.375rem] text-text-primary ${
            mono ? "font-mono" : "whitespace-pre-wrap font-sans"
          }`}
        >
          {STIMULUS_BLOCK[type.stimulus]}
        </pre>
      )}
      <p className="mt-3 flex gap-2 text-[0.9375rem] text-text-primary">
        <span className="shrink-0 font-mono text-text-tertiary">1.</span>
        <span>{PROMPT[type.format]}</span>
      </p>
      {options.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2">
          {options.map((o, i) => (
            <li
              key={o}
              className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-2 text-[0.9375rem] text-text-primary"
            >
              <span className="shrink-0 font-mono text-[0.875rem] text-text-tertiary">
                {type.format === "true-false" ? "" : `${String.fromCharCode(65 + i)}.`}
              </span>
              <span>{o}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 h-8 border-b border-text-primary" aria-hidden="true" />
      )}
    </div>
  );
}

// Static sample of what a format produces, in the exam-paper grammar. No AI
// call: the prompt and options are placeholder text per answer format, so a
// student can judge the layout before generating anything.
export default function FormatPreview({ format }: { format: ExamFormat }) {
  return (
    <ol className="flex flex-col gap-4">
      {format.types.map((t, i) => (
        <li key={t.key} className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <p className="text-[0.8125rem] font-semibold tracking-wide text-text-primary uppercase">
            Test {ROMAN[i] ?? i + 1}. {t.label}
          </p>
          <p className="mt-1 text-[0.875rem] text-text-secondary">
            {ANSWER_FORMAT_LABEL[t.format]} · {t.defaultCount} question
            {t.defaultCount === 1 ? "" : "s"} by default
          </p>
          <p className="mt-1 text-[0.875rem] text-text-secondary">{typeHint(t)}</p>
          <SampleQuestion type={t} />
          <p className="mt-3 font-mono text-[0.8125rem] tracking-wide text-text-tertiary uppercase">
            Sample · placeholder text
          </p>
        </li>
      ))}
    </ol>
  );
}
