// Rough check for whether pasted text contains program code. Prose can hold a
// stray semicolon, so one line is never enough: three code-like lines are.
const CODE_LINE = new RegExp(
  [
    String.raw`^\s*#\s*include\b`,
    String.raw`[;{}]\s*$`,
    String.raw`^\s*def\s+\w+\s*\(`,
    String.raw`^\s*function\s+\w+\s*\(`,
    String.raw`^\s*class\s+\w+`,
    String.raw`\bstd::`,
    String.raw`\bint\s+main\b`,
    String.raw`^\s*return\b.*;`,
    String.raw`=>`,
    String.raw`\b(print|printf|cout)\s*(\(|<<)`,
  ].join("|"),
);

export function looksLikeCode(text: string): boolean {
  let hits = 0;
  for (const line of text.split("\n")) {
    if (!CODE_LINE.test(line)) continue;
    if (++hits >= 3) return true;
  }
  return false;
}
