"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveReviewer } from "@/app/lib/storage";
import type { Reviewer } from "@/app/types";

export default function NewReviewerPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");

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
      notes: "",
      projectMaterial: "",
      questions: [],
      createdAt: new Date().toISOString(),
    };
    saveReviewer(reviewer);
    router.push(`/reviewer/${reviewer.id}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">New Reviewer</h1>
      <form onSubmit={handleCreate} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Reviewer Name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError("");
            }}
            placeholder="e.g. CPU Scheduling"
            className="rounded-md border border-zinc-300 px-3 py-2 text-black outline-none focus:border-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-white"
            autoFocus
          />
        </label>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          className="mt-2 rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Create Reviewer
        </button>
      </form>
    </div>
  );
}
