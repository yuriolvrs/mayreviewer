import { describe, expect, it } from "vitest";
import { looksLikeCode } from "@/app/lib/codeDetect";

describe("looksLikeCode", () => {
  it("is true for a C++ listing", () => {
    const cpp = `#include <iostream>
#include <set>
int main() {
  std::set<int> s;
  s.insert(3);
  std::cout << s.size();
  return 0;
}`;
    expect(looksLikeCode(cpp)).toBe(true);
  });

  it("is true for a Python snippet", () => {
    const py = `def total(items):
    result = 0
    for i in items:
        result += i
    print(result)
    return result

class Cart:
    pass`;
    expect(looksLikeCode(py)).toBe(true);
  });

  it("is false for history prose", () => {
    const prose = `The Reign of Terror lasted from 1793 to 1794.
It was marked by mass executions of suspected enemies of the Revolution.
The Committee of Public Safety, led by Robespierre, held great power.`;
    expect(looksLikeCode(prose)).toBe(false);
  });

  it("is false for OS prose with semicolons in sentences", () => {
    const prose = `Scheduling algorithms include FCFS; SJF; and Round Robin.
FCFS is simple; it can cause the convoy effect.
Paging splits memory into fixed frames; segmentation splits it by meaning.`;
    expect(looksLikeCode(prose)).toBe(false);
  });

  it("is false for empty text", () => {
    expect(looksLikeCode("")).toBe(false);
  });
});
