"use client";

import { useEffect, useRef } from "react";
import type { GenerationProgress } from "@/app/lib/generate";

// Generation blocks the page rather than running behind a progress bar: the run
// takes a minute, writes the whole question pool at the end, and navigating
// away mid-stream loses it. The same dialog stays mounted through to the
// success state so the spinner turns into a checkmark in place.

const FOCUSABLE = "button:not([disabled])";

function Spinner() {
  return (
    <div
      aria-hidden="true"
      className="h-9 w-9 animate-spin rounded-full border-2 border-border-strong border-t-accent"
    />
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
        {loading ? <Spinner /> : <DoneIcon />}

        <div aria-live="polite">
          <h2 id="generation-modal-title" className="text-[19px] font-semibold text-text-primary">
            {loading
              ? "Generating questions"
              : `${count} question${count === 1 ? "" : "s"} generated`}
          </h2>
          <p className="mt-1 text-[15px] text-text-secondary">
            {loading
              ? "This may take a minute. Stay on this page."
              : "They're ready in the list below — edit or delete any of them."}
          </p>
          {loading && progress && (
            <p className="mt-1 text-[14px] text-text-tertiary">
              {progress.completed} of {progress.total} source
              {progress.total === 1 ? "" : "s"} processed
            </p>
          )}
        </div>

        {loading ? (
          <button
            type="button"
            onClick={onCancel}
            className="mt-2 rounded-lg border border-border-strong px-4 py-2 text-[15px] font-medium text-text-secondary hover:border-accent hover:text-text-primary"
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={onDone}
            className="mt-2 rounded-lg bg-accent px-5 py-2 text-[15px] font-medium text-white hover:bg-accent-hover"
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}
