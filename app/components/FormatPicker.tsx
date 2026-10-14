"use client";

import type { ReactNode } from "react";
import type { ExamFormat } from "@/app/lib/examFormats";
import OptionSelect from "@/app/components/OptionSelect";
import QuestionCountControl from "@/app/components/QuestionCountControl";

// The "Exam format" section: a saved-format dropdown with the selected
// format's type labels, or the "Learn from my material" panel (passed in as
// `learnPanel`). Shared by New Reviewer and the Details tab.
export function FormatPicker({
  learn,
  formats,
  format,
  onSelectSaved,
  onSelectLearn,
  learnPanel,
}: {
  learn: boolean;
  formats: ExamFormat[];
  // The saved format the dropdown shows. Never the learn-mode draft.
  format: ExamFormat;
  onSelectSaved: (id: string) => void;
  onSelectLearn: () => void;
  learnPanel: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 border-t border-border py-6 md:grid-cols-[160px_1fr]">
      <div>
        <p className="text-[0.9375rem] font-medium text-text-primary">Exam format</p>
        <p className="mt-1 text-[0.875rem] text-text-secondary">
          The question types this reviewer generates.
        </p>
      </div>
      <div className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="Format source" className="flex flex-col gap-2 sm:flex-row sm:gap-6">
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[0.9375rem] text-text-primary">
            <input
              type="radio"
              name="exam-format-mode"
              checked={!learn}
              onChange={() => onSelectSaved(format.id)}
              className="h-4 w-4 shrink-0 accent-accent"
            />
            Use a saved format
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[0.9375rem] text-text-primary">
            <input
              type="radio"
              name="exam-format-mode"
              checked={learn}
              onChange={onSelectLearn}
              className="h-4 w-4 shrink-0 accent-accent"
            />
            Learn from my material
          </label>
        </div>

        {learn ? (
          learnPanel
        ) : (
          <div className="flex flex-col gap-2">
            <OptionSelect
              label="Exam format"
              options={formats.map((f) => ({ value: f.id, label: f.name }))}
              value={format.id}
              onChange={onSelectSaved}
            />
            <p className="text-[0.8125rem] text-text-tertiary">
              {format.types.map((t) => t.label).join(" · ")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// The "Question count" section. In learn mode the counts live in the panel,
// so this only shows the total.
export function QuestionCountSection({
  learn,
  learnPending,
  total,
  format,
  value,
  onChange,
  countError,
}: {
  learn: boolean;
  learnPending: boolean;
  total: number;
  format: ExamFormat;
  value: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  countError?: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 border-t border-border py-6 md:grid-cols-[160px_1fr]">
      <div>
        <p className="text-[0.9375rem] font-medium text-text-primary">Question count</p>
        <p className="mt-1 text-[0.875rem] text-text-secondary">How many questions to generate per type.</p>
      </div>
      <div>
        {learn ? (
          learnPending ? (
            <p className="text-[0.875rem] text-text-secondary">Counts appear after you suggest types.</p>
          ) : (
            <p className="text-[0.875rem] font-semibold text-text-primary">
              Total: {total} question{total === 1 ? "" : "s"}
              <span className="ml-2 font-normal text-text-secondary">Edit counts in the list above.</span>
            </p>
          )
        ) : (
          <QuestionCountControl format={format} value={value} onChange={onChange} />
        )}
        {countError && <p className="mt-2 text-[0.875rem] text-error">{countError}</p>}
      </div>
    </div>
  );
}
