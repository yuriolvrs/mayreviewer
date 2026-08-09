"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveReviewer } from "@/app/lib/storage";
import type { Reviewer } from "@/app/types";

export default function NewReviewerPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [topics, setTopics] = useState<string[]>([""]);
  const [error, setError] = useState("");

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

    const reviewer: Reviewer = {
      id: crypto.randomUUID(),
      reviewerName: trimmed,
      subject: subject.trim(),
      topics: topics.map((t) => t.trim()).filter(Boolean),
      notes: "",
      projectMaterial: "",
      questionCount: 10,
      questions: [],
      createdAt: new Date().toISOString(),
    };
    saveReviewer(reviewer);
    router.push(`/reviewer/${reviewer.id}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-6 px-6 py-12">
      <Link href="/" className="self-start text-[15px] text-text-secondary hover:text-text-primary">
        ← Home
      </Link>
      <h1 className="text-[34px] font-bold leading-10 tracking-tight text-text-primary">
        New reviewer
      </h1>
      <form onSubmit={handleCreate} className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[15px] font-medium text-text-secondary">Reviewer Name</span>
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
            <span className="text-[15px] font-medium text-text-secondary">Subject (optional)</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Intro to Operating Systems"
              className="h-11 rounded-lg border border-border px-3 text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[15px] font-medium text-text-secondary">Topics (optional)</span>
          {topics.map((topic, index) => (
            <div key={index} className="flex items-center gap-2.5">
              <span className="w-4 shrink-0 font-mono text-[15px] text-text-secondary">
                {index + 1}.
              </span>
              <input
                type="text"
                value={topic}
                onChange={(e) => updateTopic(index, e.target.value)}
                placeholder="e.g. Paging"
                className="h-10 flex-1 rounded-lg border border-border px-3 text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              <button
                type="button"
                onClick={() => removeTopic(index)}
                className="shrink-0 text-text-tertiary hover:text-error"
                aria-label="Remove topic"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addTopic}
            className="self-start text-[15px] font-semibold text-accent"
          >
            + Add topic
          </button>
          <p className="text-[15px] text-text-tertiary">
            Weights question generation toward these topics when set.
          </p>
        </div>

        {error && <p className="text-[15px] text-error">{error}</p>}
        <button
          type="submit"
          className="mt-2 self-start rounded-lg bg-accent px-4 py-2.5 text-[18px] font-medium text-white hover:bg-accent-hover"
        >
          Create Reviewer
        </button>
      </form>
    </div>
  );
}
