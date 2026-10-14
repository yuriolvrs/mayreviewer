"use client";

import { useEffect, useState } from "react";
import {
  MAX_ID_CHARS,
  MAX_LABEL_CHARS,
  newTypeKey,
  type FormatTypeDef,
  type UnsupportedNote,
} from "@/app/lib/examFormats";
import { ATTACHMENTS_CHANGED_EVENT, getAttachments } from "@/app/lib/attachments";
import { inferFormat } from "@/app/lib/inferFormatClient";
import { MAX_QUESTION_COUNT } from "@/app/lib/questions";
import { useOnline } from "@/app/lib/useOnline";

// The "Learn from my material" panel on New Reviewer: runs inference over
// the notes and past exam the user added above, then lists the generated types for light
// editing (label, count, remove). Deeper editing happens in the Formats page.
export default function GeneratedFormatPanel({
  reviewerId,
  notes,
  pastExam,
  subject,
  types,
  counts,
  onChange,
  formatName,
  defaultName,
  onNameChange,
  onSave,
  saved,
}: {
  reviewerId: string;
  notes: string;
  pastExam: string;
  subject: string;
  types: FormatTypeDef[];
  counts: Record<string, number>;
  onChange: (types: FormatTypeDef[], counts: Record<string, number>) => void;
  formatName: string;
  defaultName: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
  saved: boolean;
}) {
  const online = useOnline();
  const [fileCount, setFileCount] = useState(0);
  const [state, setState] = useState<"idle" | "running">("idle");
  const [error, setError] = useState("");
  const [unsupported, setUnsupported] = useState<UnsupportedNote[]>([]);

  // Stored notes and past-exam files live in IndexedDB; the add/remove event
  // keeps the button state current without polling.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      Promise.all([getAttachments(reviewerId, "notes"), getAttachments(reviewerId, "pastexam")])
        .then(([a, b]) => {
          if (!cancelled) setFileCount(a.length + b.length);
        })
        .catch(() => {});
    };
    refresh();
    window.addEventListener(ATTACHMENTS_CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(ATTACHMENTS_CHANGED_EVENT, refresh);
    };
  }, [reviewerId]);

  const hasNotes = notes.trim() !== "";
  const hasPastExam = pastExam.trim() !== "";
  const sources = [
    hasNotes && "notes",
    hasPastExam && "past exam",
    fileCount > 0 && `${fileCount} file${fileCount === 1 ? "" : "s"}`,
  ].filter(Boolean);

  const blocked = !online
    ? "Suggesting types needs an internet connection."
    : sources.length === 0
      ? "Add notes, a past exam, or files in the material sections above first."
      : "";

  async function run() {
    setState("running");
    setError("");
    setUnsupported([]);
    try {
      const stored = [
        ...(await getAttachments(reviewerId, "notes")),
        ...(await getAttachments(reviewerId, "pastexam")),
      ];
      const files = stored.map((a) => ({
        id: a.id,
        name: a.name,
        mimeType: a.mimeType,
        data: a.data,
      }));
      const result = await inferFormat({
        files,
        text: [notes, pastExam].filter((t) => t.trim() !== "").join("\n\n"),
        subject: subject.trim(),
        uploadPrefix: `past-exam/${reviewerId}`,
      });
      setUnsupported(result.unsupported);
      if (result.types.length === 0) {
        setError(
          result.unsupported.length > 0
            ? "No supported types found. See the flagged entries below."
            : "No question types recognized in that material.",
        );
        return;
      }
      const next: FormatTypeDef[] = result.types.map((t) => {
        const short = t.answerFormat === "short-answer";
        return {
          key: newTypeKey(t.label),
          label: t.label,
          format: t.answerFormat,
          shape: short ? "standalone" : t.shape,
          stimulus: short ? "none" : t.stimulusKind,
          guidance: t.guidance,
          examples: t.example ? [t.example] : [],
          defaultCount: t.suggestedCount,
        };
      });
      onChange(next, Object.fromEntries(next.map((t) => [t.key, t.defaultCount])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inference failed.");
    } finally {
      setState("idle");
    }
  }

  function setLabel(key: string, label: string) {
    onChange(
      types.map((t) => (t.key === key ? { ...t, label } : t)),
      counts,
    );
  }

  function setCount(key: string, text: string) {
    const n = parseInt(text, 10);
    onChange(types, { ...counts, [key]: Number.isFinite(n) ? Math.max(0, n) : 0 });
  }

  function remove(key: string) {
    const rest = { ...counts };
    delete rest[key];
    onChange(
      types.filter((t) => t.key !== key),
      rest,
    );
  }

  const canSave = types.length > 0 && types.every((t) => t.label.trim() !== "");

  return (
    <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <p className="text-[0.9375rem] font-semibold text-text-primary">Learn from my material</p>
      <p className="mt-1 text-[0.875rem] text-text-secondary">
        The AI suggests question types from the material you added above. You can edit the list
        before creating the reviewer.
      </p>
      <p className="mt-2 text-[0.875rem] text-text-secondary">
        Reading: {sources.length > 0 ? sources.join(", ") : "nothing yet"}
      </p>

      <div className="mt-3 flex flex-col items-start gap-2">
        <button
          type="button"
          onClick={() => void run()}
          disabled={state === "running" || !!blocked}
          className="min-h-11 rounded-lg border border-accent bg-surface px-4 py-2 text-[0.9375rem] font-medium text-accent enabled:hover:bg-accent-subtle disabled:cursor-not-allowed disabled:opacity-40"
        >
          {state === "running" ? "Reading material…" : "Suggest question types"}
        </button>
        {blocked && state !== "running" && (
          <p className="text-[0.875rem] text-text-secondary">{blocked}</p>
        )}
        {error && (
          <span role="alert" className="text-[0.875rem] text-error">
            {error}
          </span>
        )}
      </div>

      {unsupported.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {unsupported.map((u, i) => (
            <p
              key={i}
              className="rounded-lg border border-warning bg-warning-subtle px-3 py-2 text-[0.875rem] text-text-primary"
            >
              <span className="font-semibold">Not supported: {u.label}.</span> {u.reason}
            </p>
          ))}
        </div>
      )}

      {types.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          <ul className="flex flex-col gap-2">
            {types.map((t, i) => (
              <li key={t.key} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <input
                  type="text"
                  value={t.label}
                  maxLength={MAX_LABEL_CHARS}
                  onChange={(e) => setLabel(t.key, e.target.value)}
                  aria-label={`Label for type ${i + 1}`}
                  className="h-11 w-full min-w-0 rounded-lg border border-border px-3 text-text-primary outline-none focus:border-accent sm:w-auto sm:flex-1"
                />
                <input
                  type="number"
                  min={0}
                  max={MAX_QUESTION_COUNT}
                  value={counts[t.key] ?? 0}
                  onChange={(e) => setCount(t.key, e.target.value)}
                  aria-label={`Count for ${t.label.trim() || `type ${i + 1}`}`}
                  className="h-11 w-20 rounded-lg border border-border px-2 text-text-primary outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => remove(t.key)}
                  aria-label={`Remove ${t.label.trim() || `type ${i + 1}`}`}
                  className="min-h-11 shrink-0 px-2 text-[0.875rem] font-medium text-error hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <label className="flex flex-col gap-1.5">
            <span className="text-[0.875rem] text-text-secondary">Format name</span>
            <input
              type="text"
              value={formatName}
              maxLength={MAX_ID_CHARS}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={defaultName}
              className="h-11 rounded-lg border border-border px-3 text-text-primary outline-none focus:border-accent"
            />
          </label>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSave}
              disabled={!canSave}
              className="min-h-11 rounded-lg border border-border-strong bg-surface px-4 py-2 text-[0.9375rem] font-medium text-text-primary enabled:hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save to Formats
            </button>
            {saved && <span className="text-[0.875rem] text-text-secondary">Saved to Formats.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
