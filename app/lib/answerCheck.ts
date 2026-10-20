import type { Question } from "@/app/types";

// "Wait," only counts as scratch work at the start of a sentence, so OS prose
// like "P2 must wait." or "calls wait()" passes.
const SELF_CORRECTION = [
  /(?:^|[.!?…:;]\s+)wait\s*[,!…:?]/i,
  /\bre-?calculat/i,
  /\bcalculating again\b/i,
  /\bcheck(?:ing)?\s+(?:the\s+|my\s+)?calculation/i,
  /\blet me\b/i,
  /\bhmm+\b/i,
  /\boops\b/i,
  /\bon second thought\b/i,
  /\bi made (?:a|an) (?:mistake|error)\b/i,
];

// Digits inside names like "P1" are skipped by the lookbehind.
const NUMBER = /(?<![A-Za-z0-9_.])-?\d+(?:,\d{3})*(?:\.\d+)?/g;

function numbers(text: string): number[] {
  return (text.match(NUMBER) ?? []).map((t) => parseFloat(t.replace(/,/g, "")));
}

// Returns why an item's own text contradicts its key, or null if it looks fine.
export function keyConflict(q: Question): "self-correction" | "final-value" | null {
  const texts = [q.explanation, q.whyOthersWrong, q.modelAnswer];
  for (const t of texts) {
    if (t && SELF_CORRECTION.some((re) => re.test(t))) return "self-correction";
  }

  if (q.answerKind === "short" || q.options.length < 2 || !q.explanation) return null;

  // Only numeric choice questions: every option must hold exactly one number.
  const optionValues = q.options.map(numbers);
  if (!optionValues.every((v) => v.length === 1)) return null;
  const keyed = optionValues[q.correctIndex]?.[0];
  if (keyed === undefined) return null;

  // The final value is the one after the last "=" or "≈", else the last number.
  const text = q.explanation;
  const signAt = Math.max(text.lastIndexOf("="), text.lastIndexOf("≈"));
  const found = numbers(signAt >= 0 ? text.slice(signAt + 1) : text);
  const final = signAt >= 0 ? found[0] : found[found.length - 1];
  if (final === undefined) return null;

  return Math.abs(final - keyed) > 0.01 * Math.max(1, Math.abs(keyed)) ? "final-value" : null;
}
