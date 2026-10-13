"use client";

import { useEffect, useRef } from "react";

// Short answers are graded in one call when the quiz is submitted. The call
// takes a few seconds, and leaving mid-way would lose the attempt, so it blocks
// the page like generation does. If grading fails, the reader chooses: try
// again, or keep the attempt without grades and grade it later from the
// results screen. Nothing typed is ever discarded.

const FOCUSABLE = "button:not([disabled])";

export type GradingState = { phase: "running" } | { phase: "error"; message: string };

export default function GradingModal({
  state,
  onRetry,
  onSaveUngraded,
}: {
  state: GradingState;
  onRetry: () => void;
  onSaveUngraded: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Focus lands on a button when there is one, otherwise on the dialog itself
  // so the keyboard is not left behind the overlay.
  useEffect(() => {
    const target = ref.current?.querySelector<HTMLButtonElement>(FOCUSABLE) ?? ref.current;
    target?.focus();
  }, [state.phase]);

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Tab" || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const edge = e.shiftKey ? items[0] : items[items.length - 1];
    if (document.activeElement === edge) {
      e.preventDefault();
      (e.shiftKey ? items[items.length - 1] : items[0]).focus();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="grading-title"
      aria-describedby="grading-body"
      tabIndex={-1}
      ref={ref}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 outline-none"
    >
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-menu">
        {state.phase === "running" ? (
          <div className="flex items-start gap-4">
            <div
              aria-hidden="true"
              className="mt-0.5 h-9 w-9 shrink-0 animate-spin rounded-full border-2 border-border-strong border-t-accent"
            />
            <div>
              <h2 id="grading-title" className="text-[1.1875rem] font-semibold text-text-primary">
                Grading your answers
              </h2>
              <p id="grading-body" role="status" className="mt-1 text-[0.9375rem] text-text-secondary">
                Checking each short answer against its key points. This takes a few seconds.
              </p>
            </div>
          </div>
        ) : (
          <>
            <h2 id="grading-title" className="text-[1.1875rem] font-semibold text-text-primary">
              Couldn&apos;t grade your answers
            </h2>
            <p id="grading-body" className="mt-2 text-[0.9375rem] text-text-secondary">
              {state.message} Your answers are safe. You can try again, or save the attempt now and
              grade it later from the results screen.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={onSaveUngraded}
                className="rounded-lg px-4 py-2 text-[0.9375rem] font-medium text-text-secondary hover:bg-surface-alt"
              >
                Save without grading
              </button>
              <button
                onClick={onRetry}
                className="rounded-lg bg-accent px-4 py-2 text-[0.9375rem] font-medium text-on-accent hover:bg-accent-hover"
              >
                Try again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
