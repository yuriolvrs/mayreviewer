"use client";

import type { ReactNode } from "react";
import { OS_EXAM_ID, getBuiltinFormats, type ExamFormat } from "@/app/lib/examFormats";
import OptionSelect from "@/app/components/OptionSelect";

const typeLine = (f: ExamFormat) => f.types.map((t) => t.label).join(" · ");

// The "What class is this for?" section on New reviewer: big cards for the
// built-in formats, plus rows for saved customs and "Learn from my material".
// Nothing is checked until the user picks. The Details tab keeps FormatPicker.
export default function FormatChoice({
  learn,
  formats,
  examFormatId,
  onSelectSaved,
  onSelectLearn,
  learnPanel,
}: {
  learn: boolean;
  formats: ExamFormat[];
  // "" means no choice yet.
  examFormatId: string;
  onSelectSaved: (id: string) => void;
  onSelectLearn: () => void;
  learnPanel: ReactNode;
}) {
  // Built-ins in display order, with the OS exam last.
  const builtins = getBuiltinFormats().sort(
    (a, b) => Number(a.id === OS_EXAM_ID) - Number(b.id === OS_EXAM_ID),
  );
  const builtinIds = new Set(builtins.map((f) => f.id));
  const customs = formats.filter((f) => !builtinIds.has(f.id));
  const selectedCustom = !learn && examFormatId !== "" && !builtinIds.has(examFormatId);

  return (
    <div className="grid grid-cols-1 gap-6 border-t border-border py-6 md:grid-cols-[160px_1fr]">
      <div>
        <p className="text-[0.9375rem] font-medium text-text-primary">
          What class is this for? <span className="text-error">*</span>
        </p>
        <p className="mt-1 text-[0.875rem] text-text-secondary">
          Picks the question types this reviewer generates.
        </p>
      </div>
      <div role="radiogroup" aria-label="Exam format" className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {builtins.map((f) => {
            const checked = !learn && examFormatId === f.id;
            return (
              <label
                key={f.id}
                className={`flex min-h-11 cursor-pointer flex-col gap-1 rounded-lg border p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
                  checked ? "border-accent bg-accent-subtle" : "border-border hover:border-text-tertiary"
                }`}
              >
                <input
                  type="radio"
                  name="exam-format-choice"
                  checked={checked}
                  onChange={() => onSelectSaved(f.id)}
                  className="sr-only"
                />
                <span className="text-[0.9375rem] font-medium text-text-primary">{f.name}</span>
                <span className="text-[0.8125rem] text-text-tertiary">{typeLine(f)}</span>
              </label>
            );
          })}
        </div>

        {customs.length > 0 && (
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[0.9375rem] text-text-primary">
            <input
              type="radio"
              name="exam-format-choice"
              checked={selectedCustom}
              onChange={() => onSelectSaved(customs[0].id)}
              className="h-4 w-4 shrink-0 accent-accent"
            />
            Another saved format
          </label>
        )}
        {selectedCustom && (
          <div className="flex flex-col gap-2">
            <OptionSelect
              label="Exam format"
              options={customs.map((f) => ({ value: f.id, label: f.name }))}
              value={examFormatId}
              onChange={onSelectSaved}
            />
            <p className="text-[0.8125rem] text-text-tertiary">
              {typeLine(formats.find((f) => f.id === examFormatId) ?? customs[0])}
            </p>
          </div>
        )}

        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[0.9375rem] text-text-primary">
          <input
            type="radio"
            name="exam-format-choice"
            checked={learn}
            onChange={onSelectLearn}
            className="h-4 w-4 shrink-0 accent-accent"
          />
          Learn from my material
        </label>
        {learn && learnPanel}
      </div>
    </div>
  );
}
