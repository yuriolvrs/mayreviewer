"use client";

import { useState } from "react";
import { getAttachments } from "@/app/lib/attachments";
import { QUESTION_TYPES, TYPE_LABELS } from "@/app/lib/questions";
import type { Question, QuestionType, Reviewer } from "@/app/types";

type Progress = { completed: number; total: number; label: string };
type Failure = { label: string; reason: string };

type StreamMessage =
  | { type: "progress"; phase: "start" | "done"; label: string; completed: number; total: number }
  | { type: "done"; questions: Question[]; failures: Failure[] };

function bufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

const MIN_COUNT = 1;
const MAX_COUNT = 50;

export default function GenerateBar({
  reviewer,
  onGenerated,
  onCountChange,
  saveLabel,
}: {
  reviewer: Reviewer;
  onGenerated: (questions: Question[], mode: "replace" | "append") => void;
  onCountChange: (count: number) => void;
  saveLabel: string;
}) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [addedCount, setAddedCount] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [types, setTypes] = useState<QuestionType[]>(QUESTION_TYPES);
  // Held as a string so the field can be empty mid-edit instead of snapping to
  // a number the moment it's cleared. The same Reviewer.questionCount the
  // Details tab edits, so the two stay in sync.
  const [countInput, setCountInput] = useState(String(reviewer.questionCount));

  const existingCount = reviewer.questions.length;
  const limit = Math.min(Math.max(parseInt(countInput, 10) || MIN_COUNT, MIN_COUNT), MAX_COUNT);
  const remaining = Math.max(limit - existingCount, 0);

  function handleCountInput(value: string) {
    setCountInput(value);
    const parsed = parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed >= MIN_COUNT && parsed <= MAX_COUNT) {
      onCountChange(parsed);
    }
  }

  function toggleType(type: QuestionType) {
    setTypes((prev) => {
      if (!prev.includes(type)) return [...prev, type];
      // Never let the selection empty out — generating "no types" is a wasted call.
      return prev.length === 1 ? prev : prev.filter((t) => t !== type);
    });
  }

  function handleGenerateClick() {
    if (existingCount > 0) setConfirmOpen(true);
    else handleGenerate("replace");
  }

  async function handleGenerate(mode: "replace" | "append") {
    setLoading(true);
    setProgress(null);
    setError(null);
    setFailures([]);
    setAddedCount(null);
    try {
      const rawAttachments = await getAttachments(reviewer.id);
      const attachments = rawAttachments.map((a) => ({
        name: a.name,
        mimeType: a.mimeType,
        dataBase64: bufferToBase64(a.data),
        field: a.field,
      }));

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: reviewer.subject,
          topics: reviewer.topics,
          notes: reviewer.notes,
          projectMaterial: reviewer.projectMaterial,
          count: mode === "append" ? remaining : limit,
          types,
          attachments,
        }),
      });

      if (!res.ok) {
        const data: { error?: string } = await res.json();
        throw new Error(data.error || "Generation failed.");
      }
      if (!res.body) throw new Error("No response from server.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const message: StreamMessage = JSON.parse(line);

          if (message.type === "progress") {
            setProgress({ completed: message.completed, total: message.total, label: message.label });
          } else if (message.type === "done") {
            finished = true;
            onGenerated(message.questions, mode);
            setAddedCount(message.questions.length);
            setFailures(message.failures);
          }
        }
      }

      if (!finished) throw new Error("Connection closed before generation finished.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  const hasError = Boolean(error) || failures.length > 0;
  const percent = progress ? Math.round((progress.completed / progress.total) * 100) : 0;

  function statusText() {
    if (loading) {
      return progress
        ? `Generating questions… ${progress.completed} of ${progress.total} source${progress.total === 1 ? "" : "s"}`
        : "Generating questions…";
    }
    if (error) return error;
    if (failures.length > 0) {
      return `${failures.length} file${failures.length > 1 ? "s" : ""} failed to process`;
    }
    if (addedCount !== null) {
      return `${addedCount} question${addedCount === 1 ? "" : "s"} added.`;
    }
    return saveLabel;
  }

  return (
    <div className="sticky bottom-4 z-10 mt-2 rounded-lg border border-border bg-surface px-5 py-4 shadow-menu">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[14px] text-text-secondary">Types</span>
        {QUESTION_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => toggleType(t)}
            disabled={loading}
            aria-pressed={types.includes(t)}
            className={`rounded-lg px-2.5 py-1 text-[14px] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
              types.includes(t)
                ? "bg-accent text-white"
                : "border border-border-strong text-text-secondary hover:text-text-primary"
            }`}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}

        <label className="ml-auto flex items-center gap-2">
          <span className="text-[14px] text-text-secondary">Questions</span>
          <input
            type="number"
            min={MIN_COUNT}
            max={MAX_COUNT}
            value={countInput}
            onChange={(e) => handleCountInput(e.target.value)}
            onBlur={() => setCountInput(String(limit))}
            disabled={loading}
            title={`How many to generate (${MIN_COUNT}–${MAX_COUNT})`}
            className="h-9 w-20 rounded-lg border border-border bg-surface px-2 text-[14px] text-text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-4">
        <span
          className={`flex items-center gap-2 text-[15px] ${
            hasError && !loading
              ? "text-error"
              : addedCount !== null && !loading
                ? "text-success"
                : "text-text-secondary"
          }`}
        >
          {statusText()}
        </span>

        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => handleGenerate("append")}
            disabled={loading || remaining === 0}
            title={
              remaining === 0
                ? `Already at the ${limit}-question limit — raise it in the Details tab`
                : `Generate ${remaining} more to reach the ${limit}-question limit, keeping the existing ones`
            }
            className="rounded-lg border border-accent px-4 py-2.5 text-[15px] font-medium text-accent enabled:hover:bg-accent-subtle disabled:cursor-not-allowed disabled:opacity-40"
          >
            Fill to {limit}
          </button>

          <button
            type="button"
            onClick={handleGenerateClick}
            disabled={loading}
            className="rounded-lg bg-accent px-4 py-2.5 text-[15px] font-medium text-white enabled:hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Generating…" : hasError ? "Retry" : "Generate questions"}
          </button>
        </div>
      </div>

      {loading && progress && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-alt">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}

      {!loading && failures.length > 0 && (
        <ul className="mt-3 ml-5 list-disc text-[14px] text-text-secondary">
          {failures.map((f) => (
            <li key={f.label}>
              <span className="font-medium text-text-primary">{f.label}</span> — {f.reason}
            </li>
          ))}
        </ul>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-[380px] rounded-lg border border-border bg-surface p-6 shadow-menu">
            <h2 className="text-[19px] font-semibold text-text-primary">
              Overwrite existing questions?
            </h2>
            <p className="mt-2 text-[15px] text-text-secondary">
              This reviewer already has {existingCount} question
              {existingCount === 1 ? "" : "s"}. Generating new questions will replace all of them.
              This can&apos;t be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-border px-4 py-2 text-[15px] font-medium text-text-primary hover:bg-surface-alt"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  handleGenerate("replace");
                }}
                className="rounded-lg bg-error px-4 py-2 text-[15px] font-medium text-white hover:opacity-90"
              >
                Overwrite and generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
