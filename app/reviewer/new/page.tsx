"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveReviewer } from "@/app/lib/storage";
import { MAX_QUESTION_COUNT, MIN_QUESTION_COUNT } from "@/app/lib/questions";
import type { Reviewer } from "@/app/types";

// Reasonable starting point for a reviewer with no questions yet — matches
// what most first generations ask for, without forcing the max every time.
const DEFAULT_NEW_QUESTION_COUNT = 20;

export default function NewReviewerPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [topics, setTopics] = useState<string[]>([""]);
  const [questionCount, setQuestionCount] = useState(DEFAULT_NEW_QUESTION_COUNT);
  const [error, setError] = useState("");
  // Browsers don't render text-overflow:ellipsis inside <input>, so an unfocused
  // topic is drawn as a real element on top of the (text-transparent) input.
  const [focusedTopic, setFocusedTopic] = useState<number | null>(null);

  function updateTopic(index: number, value: string) {
    setTopics((prev) => prev.map((t, i) => (i === index ? value : t)));
  }

  function removeTopic(index: number) {
    setTopics((prev) => prev.filter((_, i) => i !== index));
  }

  function addTopic() {
    setTopics((prev) => [...prev, ""]);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Reviewer name is required.");
      return;
    }
    if (
      !Number.isInteger(questionCount) ||
      questionCount < MIN_QUESTION_COUNT ||
      questionCount > MAX_QUESTION_COUNT
    ) {
      setError(
        `Questions to generate must be a whole number between ${MIN_QUESTION_COUNT} and ${MAX_QUESTION_COUNT}.`,
      );
      return;
    }

    const now = new Date().toISOString();
    const reviewer: Reviewer = {
      id: crypto.randomUUID(),
      reviewerName: trimmed,
      subject: subject.trim(),
      topics: topics.map((t) => t.trim()).filter(Boolean),
      notes: "",
      projectMaterial: "",
      questionCount,
      questions: [],
      createdAt: now,
      updatedAt: now,
    };
    saveReviewer(reviewer);
    // Straight to Upload — a brand-new reviewer has no source material yet,
    // and that's the next thing it needs.
    router.push(`/reviewer/${reviewer.id}?tab=upload`);
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-8">
      <nav
        aria-label="Breadcrumb"
        className="mb-2 flex items-center gap-1.5 text-[12px] tracking-wide uppercase"
      >
        <Link href="/" className="text-text-secondary hover:text-text-primary">
          Reviewers
        </Link>
        <span aria-hidden="true" className="text-text-tertiary">
          /
        </span>
        <span className="text-text-tertiary">New reviewer</span>
      </nav>

      <h1 className="text-[26px] font-semibold text-text-primary">New reviewer</h1>

      <form onSubmit={handleCreate} className="mt-4 flex flex-col">
        <div className="grid grid-cols-[160px_1fr] gap-6 border-t border-border py-6">
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
                autoFocus
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
              min={MIN_QUESTION_COUNT}
              max={MAX_QUESTION_COUNT}
              value={questionCount}
              onChange={(e) => setQuestionCount(e.target.valueAsNumber)}
              aria-label="Questions to generate"
              className="h-11 w-24 rounded-lg border border-border px-3 text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </div>
        </div>

        {error && <p className="pb-2 text-[15px] text-error">{error}</p>}

        <div className="flex justify-end border-t border-border py-6">
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2.5 text-[15px] font-medium text-white hover:bg-accent-hover"
          >
            Create Reviewer
          </button>
        </div>
      </form>
    </div>
  );
}
