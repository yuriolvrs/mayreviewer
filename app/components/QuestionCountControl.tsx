"use client";

import { useState } from "react";
import { MAX_QUESTION_COUNT, sumCounts } from "@/app/lib/questions";
import { formatTypeKeys, typeLabelOf, type ExamFormat } from "@/app/lib/examFormats";

// Counts are held as text, not numbers, so a field can sit empty while it's
// being retyped instead of snapping back the moment it's cleared — an empty
// number input reports `valueAsNumber: NaN`, which React refuses to render.
// An empty field counts as 0; the caller's min/max check rejects an empty
// total on save.
function toCount(text: string): number {
  const parsed = parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNumbers(counts: Record<string, string>, types: string[]): Record<string, number> {
  return Object.fromEntries(types.map((t) => [t, toCount(counts[t])]));
}

function toText(counts: Record<string, number>, types: string[]): Record<string, string> {
  return Object.fromEntries(types.map((t) => [t, String(counts[t] ?? 0)]));
}

export default function QuestionCountControl({
  // The reviewer's format decides which fields exist, in what order, and
  // under what labels — not the global type list.
  format,
  value,
  onChange,
}: {
  format: ExamFormat;
  value: Record<string, number>;
  onChange: (byType: Record<string, number>) => void;
}) {
  const types = formatTypeKeys(format);
  const [text, setText] = useState<Record<string, string>>(() => toText(value, types));

  // What we last sent up. Anything else moving `value` came from outside (a
  // different reviewer loaded, a save refreshing props), and only then should
  // the fields be re-seeded — otherwise clearing one would immediately refill
  // it with the 0 we just reported.
  const [lastReported, setLastReported] = useState(value);
  if (!types.every((t) => value[t] === lastReported[t])) {
    setLastReported(value);
    setText(toText(value, types));
  }

  const total = sumCounts(toNumbers(text, types));

  function updateType(type: string, raw: string) {
    const next = { ...text, [type]: raw };
    setText(next);
    const byType = toNumbers(next, types);
    setLastReported(byType);
    onChange(byType);
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {types.map((type) => (
          <label key={type} className="flex flex-col gap-1.5">
            <span className="text-[14px] text-text-secondary">{typeLabelOf(format, type)}</span>
            <input
              type="number"
              min={0}
              max={MAX_QUESTION_COUNT}
              value={text[type]}
              onChange={(e) => updateType(type, e.target.value)}
              aria-label={`${typeLabelOf(format, type)} questions to generate`}
              className="h-11 w-full rounded-lg border border-border px-3 text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
        ))}
      </div>
      <p className="mt-3 text-[14px] font-semibold text-text-primary">
        Total: {total} question{total === 1 ? "" : "s"}
      </p>
    </div>
  );
}
