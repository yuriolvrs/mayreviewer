"use client";

import { useState } from "react";
import { MAX_QUESTION_COUNT, MIN_QUESTION_COUNT, QUESTION_TYPES, TYPE_LABELS } from "@/app/lib/questions";
import type { QuestionType } from "@/app/types";

// Splits a total evenly across question types, handing any remainder to the
// outermost types first (then working inward) so it doesn't always land on
// the same one — e.g. 50 -> 13, 12, 12, 13, not 13, 13, 12, 12.
function splitEvenly(total: number): Record<QuestionType, number> {
  const n = QUESTION_TYPES.length;
  const base = Math.floor(total / n);
  let remainder = total - base * n;

  const counts = Object.fromEntries(QUESTION_TYPES.map((t) => [t, base])) as Record<QuestionType, number>;

  let lo = 0;
  let hi = n - 1;
  while (remainder > 0 && lo <= hi) {
    counts[QUESTION_TYPES[lo]]++;
    remainder--;
    if (hi !== lo && remainder > 0) {
      counts[QUESTION_TYPES[hi]]++;
      remainder--;
    }
    lo++;
    hi--;
  }
  return counts;
}

export default function QuestionCountControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [customizing, setCustomizing] = useState(false);
  const [perType, setPerType] = useState<Record<QuestionType, number>>(() => splitEvenly(value));

  const total = QUESTION_TYPES.reduce((sum, t) => sum + (perType[t] || 0), 0);

  function updateType(type: QuestionType, count: number) {
    const next = { ...perType, [type]: count };
    setPerType(next);
    onChange(QUESTION_TYPES.reduce((sum, t) => sum + (next[t] || 0), 0));
  }

  if (!customizing) {
    return (
      <div>
        <input
          type="number"
          min={MIN_QUESTION_COUNT}
          max={MAX_QUESTION_COUNT}
          value={value}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          aria-label="Questions to generate"
          className="h-11 w-24 rounded-lg border border-border px-3 text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <div className="mt-2">
          <button
            type="button"
            onClick={() => {
              // Only re-split when the retained breakdown no longer adds up to
              // the total — otherwise collapsing and expanding again would
              // flatten a breakdown the user deliberately made uneven.
              if (total !== value) setPerType(splitEvenly(value));
              setCustomizing(true);
            }}
            className="text-[14px] font-medium text-accent hover:underline"
          >
            Customize by type
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {QUESTION_TYPES.map((type) => (
          <label key={type} className="flex flex-col gap-1.5">
            <span className="text-[14px] text-text-secondary">{TYPE_LABELS[type]}</span>
            <input
              type="number"
              min={0}
              max={MAX_QUESTION_COUNT}
              value={perType[type]}
              onChange={(e) => updateType(type, e.target.valueAsNumber)}
              aria-label={`${TYPE_LABELS[type]} questions to generate`}
              className="h-11 w-full rounded-lg border border-border px-3 text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
        ))}
      </div>
      <p className="mt-3 text-[14px] text-text-secondary">
        Total: {total} question{total === 1 ? "" : "s"}
      </p>
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setCustomizing(false)}
          className="text-[14px] font-medium text-accent hover:underline"
        >
          Use total only
        </button>
      </div>
    </div>
  );
}
