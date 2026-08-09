"use client";

import { useEffect, useState } from "react";
import { updateReviewer } from "@/app/lib/storage";
import type { Reviewer } from "@/app/types";

export default function DetailsTab({
  reviewer,
  onSaved,
  onDeleteRequest,
}: {
  reviewer: Reviewer;
  onSaved: () => void;
  onDeleteRequest: () => void;
}) {
  const [name, setName] = useState(reviewer.reviewerName);
  const [subject, setSubject] = useState(reviewer.subject);
  const [topics, setTopics] = useState<string[]>(reviewer.topics.length ? reviewer.topics : [""]);
  const [questionCount, setQuestionCount] = useState(reviewer.questionCount);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState(false);
  // Browsers don't render text-overflow:ellipsis inside <input>, so an unfocused
  // topic is drawn as a real element on top of the (text-transparent) input.
  const [focusedTopic, setFocusedTopic] = useState<number | null>(null);

  useEffect(() => {
    setName(reviewer.reviewerName);
    setSubject(reviewer.subject);
    setTopics(reviewer.topics.length ? reviewer.topics : [""]);
    setQuestionCount(reviewer.questionCount);
  }, [reviewer.id, reviewer.reviewerName, reviewer.subject, reviewer.topics, reviewer.questionCount]);

  const dirty =
    name !== reviewer.reviewerName ||
    subject !== reviewer.subject ||
    topics.join("\n") !== (reviewer.topics.length ? reviewer.topics : [""]).join("\n") ||
    questionCount !== reviewer.questionCount;

  function updateTopic(index: number, value: string) {
    setTopics((prev) => prev.map((t, i) => (i === index ? value : t)));
  }

  function removeTopic(index: number) {
    setTopics((prev) => prev.filter((_, i) => i !== index));
  }

  function addTopic() {
    setTopics((prev) => [...prev, ""]);
  }

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Reviewer name is required.");
      return;
    }
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 50) {
      setError("Questions to Generate must be a whole number between 1 and 50.");
      return;
    }

    // Re-reads before writing, so saving details can't revert notes typed in
    // the Upload tab (or questions added by a generation) since this render.
    updateReviewer(reviewer.id, {
      reviewerName: trimmed,
      subject: subject.trim(),
      topics: topics.map((t) => t.trim()).filter(Boolean),
      questionCount,
    });
    setSavedMessage(true);
    onSaved();
    setTimeout(() => setSavedMessage(false), 2000);
  }

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[160px_1fr] gap-6 py-6">
        <div>
          <p className="text-[15px] font-medium text-text-primary">Reviewer info</p>
          <p className="mt-1 text-[14px] text-text-secondary">Name and subject for this reviewer.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[14px] text-text-secondary">Reviewer name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
              placeholder="e.g. CPU Scheduling"
              className="h-11 rounded-lg border border-border px-3 text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[14px] text-text-secondary">Subject (optional)</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Intro to Operating Systems"
              className="h-11 rounded-lg border border-border px-3 text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-[160px_1fr] gap-6 border-t border-border py-6">
        <div>
          <p className="text-[15px] font-medium text-text-primary">Topics</p>
          <p className="mt-1 text-[14px] text-text-secondary">
            Optional. Weights question generation toward these topics.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
          {topics.map((topic, index) => {
            const showOverlay = Boolean(topic) && focusedTopic !== index;
            return (
            <div key={index} className="relative">
              <input
                type="text"
                value={topic}
                title={topic}
                onChange={(e) => updateTopic(index, e.target.value)}
                onFocus={() => setFocusedTopic(index)}
                onBlur={() => setFocusedTopic(null)}
                placeholder="e.g. Paging"
                className={`h-11 w-full truncate rounded-lg border border-border pl-3 pr-8 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 ${
                  showOverlay ? "text-transparent" : "text-text-primary"
                }`}
              />
              {showOverlay && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0 right-8 flex items-center truncate pl-3 text-text-primary"
                >
                  {topic}
                </span>
              )}
              <button
                type="button"
                onClick={() => removeTopic(index)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-error"
                aria-label="Remove topic"
              >
                ✕
              </button>
            </div>
            );
          })}
          <button
            type="button"
            onClick={addTopic}
            className="col-span-2 flex h-11 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong text-[15px] font-medium text-text-secondary hover:border-accent hover:text-accent"
          >
            + Add topic
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[160px_1fr] gap-6 border-t border-border py-6">
        <div>
          <p className="text-[15px] font-medium text-text-primary">Generation</p>
          <p className="mt-1 text-[14px] text-text-secondary">How many questions to generate.</p>
        </div>
        <div>
          <input
            type="number"
            min={1}
            max={50}
            value={questionCount}
            onChange={(e) => setQuestionCount(e.target.valueAsNumber)}
            aria-label="Questions to generate"
            className="h-11 w-24 rounded-lg border border-border px-3 text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>
      </div>

      {error && <p className="pb-2 text-[15px] text-error">{error}</p>}

      <div className="flex items-center justify-end gap-3 border-t border-border py-6">
        {savedMessage && <span className="text-[15px] text-success">Saved.</span>}
        <button
          onClick={handleSave}
          disabled={!dirty}
          title={dirty ? undefined : "No changes to save"}
          className="rounded-lg bg-accent px-4 py-2.5 text-[15px] font-medium text-white enabled:hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save details
        </button>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-error px-5 py-4">
        <div>
          <p className="text-[15px] font-semibold text-error">Danger zone</p>
          <p className="mt-1 text-[14px] text-text-secondary">
            Deleting this reviewer removes all of its questions and content. This can&apos;t be undone.
          </p>
        </div>
        <button
          onClick={onDeleteRequest}
          className="shrink-0 rounded-lg border border-error px-4 py-2 text-[15px] font-medium text-error hover:bg-error hover:text-white"
        >
          Delete reviewer
        </button>
      </div>
    </div>
  );
}
