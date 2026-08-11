"use client";

import { useState } from "react";
import { MAX_QUESTION_COUNT, QUESTION_TYPES, TYPE_LABELS, sumCounts } from "@/app/lib/questions";
import type { QuestionType } from "@/app/types";

// Counts are held as text, not numbers, so a field can sit empty while it's
// being retyped instead of snapping back the moment it's cleared — an empty
// number input reports `valueAsNumber: NaN`, which React refuses to render.
// An empty field counts as 0; the caller's min/max check rejects an empty
// total on save.
function toCount(text: string): number {
  const parsed = parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNumbers(counts: Record<QuestionType, string>): Record<QuestionType, number> {
  return Object.fromEntries(QUESTION_TYPES.map((t) => [t, toCount(counts[t])])) as Record<
    QuestionType,
    number
  >;
}

function toText(counts: Record<QuestionType, number>): Record<QuestionType, string> {
  return Object.fromEntries(QUESTION_TYPES.map((t) => [t, String(counts[t] ?? 0)])) as Record<
    QuestionType,
    string
  >;
}

export default function QuestionCountControl({
  value,
  onChange,
}: {
  value: Record<QuestionType, number>;
  onChange: (byType: Record<QuestionType, number>) => void;
}) {
  const [text, setText] = useState<Record<QuestionType, string>>(() => toText(value));

  // What we last sent up. Anything else moving `value` came from outside (a
  // different reviewer loaded, a save refreshing props), and only then should
  // the fields be re-seeded — otherwise clearing one would immediately refill
  // it with the 0 we just reported.
  const [lastReported, setLastReported] = useState(value);
  if (!QUESTION_TYPES.every((t) => value[t] === lastReported[t])) {
    setLastReported(value);
    setText(toText(value));
  }

  const total = sumCounts(toNumbers(text));

  function updateType(type: QuestionType, raw: string) {
    const next = { ...text, [type]: raw };
    setText(next);
    const byType = toNumbers(next);
    setLastReported(byType);
    onChange(byType);
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {QUESTION_TYPES.map((type) => (
          <label key={type} className="flex flex-col gap-1.5">
            <span className="text-[14px] text-text-secondary">{TYPE_LABELS[type]}</span>
            <input
              type="number"
              min={0}
              max={MAX_QUESTION_COUNT}
              value={text[type]}
              onChange={(e) => updateType(type, e.target.value)}
              aria-label={`${TYPE_LABELS[type]} questions to generate`}
              className="h-11 w-full rounded-lg border border-border px-3 text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
        ))}
      </div>
      <p className="mt-3 text-[14px] text-text-secondary">
        Total: {total} question{total === 1 ? "" : "s"}
      </p>
    </div>
  );
}
