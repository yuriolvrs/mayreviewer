import { turnstileHeaders } from "@/app/lib/turnstileClient";
import type { GradeItem, GradeResponse } from "@/app/lib/grading";
import type { ShortGrade } from "@/app/types";

// The client half of grading: one request carrying every short answer in the
// attempt, answered with a grade per id. Lives beside generate.ts rather than
// in the quiz page so the page only has to own the submit-time UI state.

function isGrade(value: unknown): value is ShortGrade {
  if (typeof value !== "object" || value === null) return false;
  const g = value as Record<string, unknown>;
  return (
    Array.isArray(g.met) &&
    g.met.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0) &&
    typeof g.feedback === "string" &&
    typeof g.credit === "number" &&
    Number.isFinite(g.credit) &&
    g.credit >= 0 &&
    g.credit <= 1
  );
}

// Exported for tests: a response from the wire is checked before it is
// allowed anywhere near a stored attempt.
export function parseGradeResponse(data: unknown): GradeResponse | null {
  if (typeof data !== "object" || data === null) return null;
  const { grades, failed } = data as { grades?: unknown; failed?: unknown };
  if (typeof grades !== "object" || grades === null || Array.isArray(grades)) return null;
  if (!Array.isArray(failed) || !failed.every((id) => typeof id === "string")) return null;

  const clean: Record<string, ShortGrade> = {};
  for (const [id, grade] of Object.entries(grades)) {
    if (isGrade(grade)) clean[id] = { met: grade.met, feedback: grade.feedback, credit: grade.credit };
  }
  return { grades: clean, failed };
}

export async function gradeShortAnswers(
  items: GradeItem[],
  signal?: AbortSignal,
): Promise<GradeResponse> {
  const res = await fetch("/api/grade", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", ...(await turnstileHeaders()) },
    body: JSON.stringify({ items }),
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Handled below with the status text.
  }

  if (!res.ok) {
    const message = (data as { error?: unknown } | null)?.error;
    throw new Error(typeof message === "string" ? message : `Grading failed (${res.status}).`);
  }

  const parsed = parseGradeResponse(data);
  if (!parsed) throw new Error("Grading returned an unexpected response.");
  return parsed;
}
