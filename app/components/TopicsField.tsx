"use client";

import { useEffect, useRef, useState } from "react";
import type { useTopicList } from "@/app/lib/useTopics";

// The Topics section. Shared by New Reviewer and the Details tab. The caller
// owns the list (see useTopicList) and reads the values when it saves.
export default function TopicsField({ topicList }: { topicList: ReturnType<typeof useTopicList> }) {
  // Browsers don't render text-overflow:ellipsis inside <input>, so an unfocused
  // topic is drawn as a real element on top of the (text-transparent) input.
  const [focusedTopic, setFocusedTopic] = useState<string | null>(null);

  // Enter in a topic input adds a row instead of submitting the form.
  const topicsRef = useRef<HTMLDivElement>(null);
  const focusNewTopic = useRef(false);
  useEffect(() => {
    if (!focusNewTopic.current) return;
    focusNewTopic.current = false;
    const inputs = topicsRef.current?.querySelectorAll("input");
    inputs?.[inputs.length - 1]?.focus();
  }, [topicList.rows.length]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    focusNewTopic.current = true;
    topicList.add();
  }

  return (
    <div className="grid grid-cols-1 gap-6 border-t border-border py-6 md:grid-cols-[160px_1fr]">
      <div>
        <p className="text-[0.9375rem] font-medium text-text-primary">Topics</p>
        <p className="mt-1 text-[0.875rem] text-text-secondary">
          Optional. Weights question generation toward these topics.
        </p>
      </div>
      <div ref={topicsRef} className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
        {topicList.rows.map((row) => {
          const showOverlay = Boolean(row.value) && focusedTopic !== row.id;
          return (
            <div key={row.id} className="relative">
              <input
                type="text"
                value={row.value}
                title={row.value}
                onChange={(e) => topicList.update(row.id, e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setFocusedTopic(row.id)}
                onBlur={() => setFocusedTopic(null)}
                placeholder="e.g. Quadratic equations"
                className={`h-11 w-full truncate rounded-lg border border-border pl-3 pr-8 outline-none focus:border-accent ${
                  showOverlay ? "text-transparent" : "text-text-primary"
                }`}
              />
              {showOverlay && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0 right-8 flex items-center truncate pl-3 text-text-primary"
                >
                  {row.value}
                </span>
              )}
              <button
                type="button"
                onClick={() => topicList.remove(row.id)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-error"
                aria-label={row.value ? `Remove topic ${row.value}` : "Remove topic"}
              >
                ✕
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => topicList.add()}
          className="col-span-full flex h-11 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong text-[0.9375rem] font-medium text-text-secondary hover:border-accent hover:text-accent"
        >
          + Add topic
        </button>
      </div>
    </div>
  );
}
