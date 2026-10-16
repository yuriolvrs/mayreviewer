// Badge levels render as Roman numerals (Goal Getter I). Same output as the
// helper inside the progress page, which can switch to this one.
export function toRoman(n: number): string {
  const table: [number, string][] = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let numeral = "";
  let rest = n;
  for (const [value, symbol] of table) {
    while (rest >= value) {
      numeral += symbol;
      rest -= value;
    }
  }
  return numeral;
}
