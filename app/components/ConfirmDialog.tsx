"use client";

import { useEffect, useRef } from "react";

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
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // The dialog owns the keyboard while open: initial focus lands inside,
  // Tab cycles within it, Escape cancels. Body scroll locks and focus
  // returns to the trigger on unmount.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>(FOCUSABLE)?.focus();
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
        <h2 id="confirm-dialog-title" className="text-[19px] font-semibold text-text-primary">{title}</h2>
        <p id="confirm-dialog-body" className="mt-2 text-[15px] text-text-secondary">{body}</p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-[15px] font-medium text-text-secondary hover:bg-surface-alt"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-[15px] font-medium text-white ${
              destructive ? "bg-error hover:opacity-90" : "bg-accent hover:bg-accent-hover"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
