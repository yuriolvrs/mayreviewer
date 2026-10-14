"use client";

import { useEffect, useRef } from "react";
import DisplayNameForm from "@/app/components/DisplayNameForm";
import type { Profile } from "@/app/lib/profile";

const FOCUSABLE = "button:not([disabled]), input:not([disabled])";

// One-step modal: pick `Name#tag`. "Not now" closes it; the user is only
// blocked from sharing.
export default function DisplayNamePrompt({
  onSaved,
  onClose,
}: {
  onSaved: (profile: Profile) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    firstField.current?.focus();
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
      onClose();
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
      aria-labelledby="display-name-prompt-title"
      aria-describedby="display-name-prompt-body"
      ref={ref}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-lg border border-border bg-surface p-6 shadow-menu">
        <h2 id="display-name-prompt-title" className="text-[1.1875rem] font-semibold text-text-primary">
          Pick your display name
        </h2>
        <p id="display-name-prompt-body" className="mb-4 mt-2 text-[0.9375rem] text-text-secondary">
          This is how you appear on shares when you choose to show your name.
        </p>
        <DisplayNameForm
          initial={null}
          onSaved={onSaved}
          submitLabel="Save"
          firstFieldRef={firstField}
          extraActions={
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-lg px-4 py-2 text-[0.9375rem] font-medium text-text-secondary hover:bg-surface-alt"
            >
              Not now
            </button>
          }
        />
      </div>
    </div>
  );
}
