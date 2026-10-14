"use client";

import { useEffect, useRef, useState } from "react";
import type { GenerationProgress } from "@/app/lib/generate";
import {
  FILL_LABEL,
  VERIFY_CREEP_PERCENT,
  generationView,
  monotonicPercent,
  sourcesText,
  stepStatus,
  type StepId,
  type StepStatus,
} from "@/app/lib/generationSteps";

// Generation blocks the page rather than running behind a progress bar: the run
// takes a minute, writes the whole question pool at the end, and navigating
// away mid-stream loses it. The same dialog stays mounted through to the
// success state so the spinner turns into a checkmark in place.

const FOCUSABLE = "button:not([disabled])";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return (
    document.documentElement.dataset.reduceMotion === "true" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function StepMarker({ status }: { status: StepStatus }) {
  if (status === "done") {
    return (
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success"
      >
        <svg width="12" height="12" viewBox="0 0 18 18" fill="none">
          <path
            d="M4 9.5 7.5 13 14 5.5"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
      <span
        className={
          status === "active"
            ? "h-2.5 w-2.5 rounded-full bg-accent motion-safe:animate-pulse"
            : "h-2.5 w-2.5 rounded-full border-2 border-border-strong"
        }
      />
    </span>
  );
}

function DoneIcon() {
  return (
    <div
      aria-hidden="true"
      className="flex h-9 w-9 items-center justify-center rounded-full bg-success-subtle text-success"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path
          d="M4 9.5 7.5 13 14 5.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export default function GenerationModal({
  state,
  progress,
  count,
  onCancel,
  onDone,
}: {
  state: "loading" | "success";
  progress: GenerationProgress | null;
  count: number;
  onCancel: () => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Focus lands on whichever button the current state offers — including after
  // the swap, when the button the keyboard was on has just been replaced.
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>(FOCUSABLE)?.focus();
  }, [state]);

  // Lock background scroll while open and return focus to the trigger on
  // unmount, so keyboard users land back where they started.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  // The dialog owns the keyboard while it's up: Tab cycles within it and Escape
  // does nothing, so the only ways out are Cancel and Done.
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      return;
    }
    if (e.key !== "Tab" || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const edge = e.shiftKey ? items[0] : items[items.length - 1];
    if (document.activeElement === edge) {
      e.preventDefault();
      (e.shiftKey ? items[items.length - 1] : items[0]).focus();
    }
  }

  const loading = state === "loading";
  const success = !loading;

  const view = generationView(progress);
  // Adjusting state during render: the bar keeps the highest value seen.
  const [maxPercent, setMaxPercent] = useState(0);
  const creeping = loading && view.step === "verify" && !prefersReducedMotion();
  const target = success ? 100 : creeping ? VERIFY_CREEP_PERCENT : view.percent;
  const percent = monotonicPercent(maxPercent, target);
  if (percent !== maxPercent) setMaxPercent(percent);

  // The replacement step is listed only after the server first reports it.
  const [sawFill, setSawFill] = useState(false);
  if (view.showFill && !sawFill) setSawFill(true);

  const steps: { id: StepId; label: string }[] = [
    { id: "upload", label: "Preparing your files" },
    { id: "write", label: "Reading your material and writing questions" },
    { id: "verify", label: "Double-checking answers" },
    ...(sawFill ? [{ id: "fill" as const, label: FILL_LABEL }] : []),
  ];
  const activeLabel = steps.find((st) => st.id === view.step)?.label ?? "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="generation-modal-title"
      ref={ref}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-lg border border-border bg-surface px-6 py-8 text-center shadow-menu">
        {success && <DoneIcon />}

        <div>
          <h2 id="generation-modal-title" className="text-[1.1875rem] font-semibold text-text-primary">
            {loading
              ? "Generating questions"
              : `${count} question${count === 1 ? "" : "s"} generated`}
          </h2>
          {loading && (
            <p className="mt-1 text-[0.9375rem] text-text-secondary">
              This may take a minute. Stay on this page.
            </p>
          )}
        </div>

        {/* Announces step changes only, not every progress tick. */}
        <p aria-live="polite" className="sr-only">
          {loading ? activeLabel : "Done"}
        </p>

        {loading && (
          <>
            <div
              role="progressbar"
              aria-label="Overall progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(percent)}
              className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border"
            >
              <div
                className={`h-full rounded-full bg-accent ease-out motion-safe:transition-[width] ${
                  creeping ? "duration-[40000ms]" : "duration-500"
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>

            <ol className="mt-2 flex w-full flex-col gap-3 text-left">
              {steps.map((st) => {
                const status = stepStatus(st.id, view.step, false);
                return (
                  <li key={st.id} className="flex items-start gap-3">
                    <StepMarker status={status} />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-[0.9375rem] ${
                          status === "pending" ? "text-text-tertiary" : "text-text-primary"
                        } ${status === "active" ? "font-medium" : ""}`}
                      >
                        {st.label}
                      </p>
                      {st.id === "write" && status === "active" && progress && progress.stage === undefined && (
                        <p className="mt-0.5 text-[0.875rem] text-text-tertiary">
                          {sourcesText(progress.completed, progress.total)}
                        </p>
                      )}
                      {(st.id === "verify" || st.id === "fill") && status === "active" && (
                        <div
                          aria-hidden="true"
                          className="mt-1.5 h-1 w-full rounded-full bg-border-strong motion-safe:animate-pulse"
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}

        {loading ? (
          <button
            type="button"
            onClick={onCancel}
            className="mt-2 rounded-lg border border-border-strong px-4 py-2 text-[0.9375rem] font-medium text-text-secondary hover:border-accent hover:text-text-primary"
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={onDone}
            className="mt-2 rounded-lg bg-accent px-5 py-2 text-[0.9375rem] font-medium text-on-accent hover:bg-accent-hover"
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}
