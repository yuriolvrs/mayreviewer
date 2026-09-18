"use client";

import { useEffect, useRef, useState } from "react";

export type OptionChoice = { value: string; label: string; hint?: string };

// Native <select> can't show per-choice subtitles (<option> renders text
// only), so this listbox stands in wherever choices need explaining: a
// button showing the current pick, opening a list of label + hint rows.
// Keyboard: arrows move, Enter/Space picks, Escape closes, Tab dismisses.
// Focus never leaves the button, so tab order is unchanged.
export default function OptionSelect({
  label,
  options,
  value,
  onChange,
}: {
  // Spoken name for the button and list ("Answer format").
  label: string;
  options: OptionChoice[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];

  function openList() {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open ]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + options.length) % options.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(options[active].value);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        ref={buttonRef}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-2 text-[15px] text-text-primary outline-none focus:border-accent"
      >
        <span className="truncate">{current.label}</span>
        <svg width="14" height="14" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="shrink-0">
          <path
            d="M2 3.5l3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={label}
          className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-border bg-surface py-1 shadow-menu"
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onClick={() => pick(o.value)}
              onMouseEnter={() => setActive(i)}
              className={`flex min-h-[44px] cursor-pointer flex-col justify-center px-3 py-1.5 ${
                i === active ? "bg-surface-alt" : ""
              }`}
            >
              <span
                className={`text-[15px] ${
                  o.value === value ? "font-semibold text-text-primary" : "text-text-primary"
                }`}
              >
                {o.label}
              </span>
              {o.hint && <span className="text-[13px] text-text-secondary">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
