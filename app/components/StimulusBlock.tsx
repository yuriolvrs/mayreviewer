"use client";

import { useState } from "react";

const BLANK_MARKER = /(_{2,}\(\d+\)_{2,})/g;

// A stimulus wide enough to scroll gives no hint that it does; the fade only
// shows while there's still content past the right edge.
export default function StimulusBlock({
  stimulus,
  questionIds,
}: {
  stimulus: string;
  // Blanks are numbered ___(1)___, ___(2)___, … in reading order, one per
  // question in the set — so blank N jumps to questionIds[N - 1].
  questionIds?: string[];
}) {
  const [atEnd, setAtEnd] = useState(true);

  function measure(el: HTMLPreElement | null) {
    if (!el) return;
    setAtEnd(Math.ceil(el.scrollLeft + el.clientWidth) >= el.scrollWidth);
  }

  function jumpToQuestion(id: string) {
    document.getElementById(`question-${id}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  // Every blank is highlighted, not just the one whose question is in view —
  // a blank can sit well above or below its question, so tying the highlight to
  // scroll position left the one you were actually working on unmarked.
  const parts = stimulus.split(BLANK_MARKER).filter((part) => part !== "");

  return (
    <div className="relative mt-3">
      <pre
        ref={measure}
        onScroll={(e) => measure(e.currentTarget)}
        className="overflow-x-auto rounded-lg border border-border bg-surface-alt p-4 font-mono text-[14px] leading-relaxed text-text-primary"
      >
        {parts.map((part, i) => {
          const match = /^_{2,}\((\d+)\)_{2,}$/.exec(part);
          if (!match) return <span key={i}>{part}</span>;

          const targetId = questionIds?.[Number(match[1]) - 1];
          if (!targetId) {
            return (
              <mark key={i} className="rounded bg-info-subtle px-1 font-bold text-info">
                {part}
              </mark>
            );
          }

          return (
            <button
              key={i}
              type="button"
              onClick={() => jumpToQuestion(targetId)}
              title="Jump to this question"
              className="rounded bg-info-subtle px-1 font-bold text-info underline decoration-dotted underline-offset-2 hover:bg-info-subtle/70"
            >
              {part}
            </button>
          );
        })}
      </pre>
      {!atEnd && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-px right-px w-10 rounded-r-lg bg-gradient-to-l from-surface-alt to-transparent"
        />
      )}
    </div>
  );
}
