"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Shared so a destructive action looks the same wherever it's triggered — the
// Home list used a native window.confirm while the Reviewer page used a styled
// modal for the very same delete.
const FOCUSABLE = "button:not([disabled])";

export default function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
  secondaryLabel,
  onSecondary,
  secondaryDisabled = false,
  children,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  // Optional third choice. When set, the buttons stack: secondary, confirm, cancel.
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryDisabled?: boolean;
  // Extra content under the body, e.g. what each choice removes or why one is disabled.
  children?: ReactNode;
}) {
  const stacked = secondaryLabel !== undefined && onSecondary !== undefined;
  const cancelButton = (
    <button
      onClick={onCancel}
      // With two destructive-ish choices stacked above it, Cancel takes the
      // initial focus so Enter never replaces questions by accident.
      data-autofocus={stacked ? "" : undefined}
      className={`rounded-lg px-4 py-2 text-[0.9375rem] font-medium text-text-secondary hover:bg-surface-alt ${stacked ? "min-h-11" : ""}`}
    >
      {cancelLabel}
    </button>
  );
  const ref = useRef<HTMLDivElement>(null);

  // The dialog owns the keyboard while open: initial focus lands inside,
  // Tab cycles within it, Escape cancels. Body scroll locks and focus
  // returns to the trigger on unmount.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    (
      ref.current?.querySelector<HTMLButtonElement>("[data-autofocus]") ??
      ref.current?.querySelector<HTMLButtonElement>(FOCUSABLE)
    )?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-body"
      ref={ref}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-menu">
        <h2 id="confirm-dialog-title" className="text-[1.1875rem] font-semibold text-text-primary">{title}</h2>
        <p id="confirm-dialog-body" className="mt-2 text-[0.9375rem] text-text-secondary">{body}</p>
        {children}
        <div className={stacked ? "mt-5 flex flex-col gap-2" : "mt-5 flex justify-end gap-3"}>
          {stacked && (
            <button
              onClick={onSecondary}
              disabled={secondaryDisabled}
              className="min-h-11 rounded-lg border border-border-strong px-4 py-2 text-[0.9375rem] font-medium text-text-primary enabled:hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {secondaryLabel}
            </button>
          )}
          {/* DOM order is the visual order: stacked puts Cancel last, the
              original row puts it first. */}
          {!stacked && cancelButton}
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-[0.9375rem] font-medium ${stacked ? "min-h-11" : ""} ${
              destructive ? "bg-error text-on-error hover:opacity-90" : "bg-accent text-on-accent hover:bg-accent-hover"
            }`}
          >
            {confirmLabel}
          </button>
          {stacked && cancelButton}
        </div>
      </div>
    </div>
  );
}
