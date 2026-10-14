import type { GenerationProgress } from "@/app/lib/generate";

// Maps the raw stream progress onto the steps the generation dialog lists and
// one overall percent. Pure so it can be tested without a DOM.

export type StepId = "upload" | "write" | "verify" | "fill";

export type StepStatus = "done" | "active" | "pending";

export type GenerationView = {
  step: StepId;
  // Overall progress, 0 to 100. Not yet monotonic: see `monotonicPercent`.
  percent: number;
  // True once the server has sent the replacement-question label. The "fill"
  // step is listed only after that.
  showFill: boolean;
};

export const FILL_LABEL = "Filling in replacement questions";

// While verifying has no sub-progress, the bar may creep up to this value.
export const VERIFY_CREEP_PERCENT = 95;

export function generationView(progress: GenerationProgress | null): GenerationView {
  if (!progress || progress.stage === "upload") {
    return { step: "upload", percent: 5, showFill: false };
  }
  if (progress.stage === "verify") {
    if (progress.label === FILL_LABEL) return { step: "fill", percent: 85, showFill: true };
    return { step: "verify", percent: 70, showFill: false };
  }
  const ratio = progress.total > 0 ? Math.min(1, Math.max(0, progress.completed / progress.total)) : 0;
  return { step: "write", percent: 10 + 60 * ratio, showFill: false };
}

// The bar never moves backwards, even if a late message maps lower.
export function monotonicPercent(previous: number, next: number): number {
  return Math.max(previous, next);
}

const ORDER: StepId[] = ["upload", "write", "verify", "fill"];

export function stepStatus(step: StepId, current: StepId, success: boolean): StepStatus {
  if (success) return "done";
  const a = ORDER.indexOf(step);
  const b = ORDER.indexOf(current);
  if (a < b) return "done";
  return a === b ? "active" : "pending";
}

export function sourcesText(completed: number, total: number): string {
  return `${completed} of ${total} source${total === 1 ? "" : "s"}`;
}
