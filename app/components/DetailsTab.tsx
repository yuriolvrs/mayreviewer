"use client";

import { useEffect, useRef, useState } from "react";
import { updateReviewer } from "@/app/lib/storage";
import {
  MAX_QUESTION_COUNT,
  MIN_QUESTION_COUNT,
  QUESTION_TYPES,
  sumCounts,
} from "@/app/lib/questions";
import QuestionCountControl from "@/app/components/QuestionCountControl";
import SourceSections, { type SaveStatus } from "@/app/components/SourceSections";
import type { QuestionType, Reviewer } from "@/app/types";

// Long enough that a burst of typing is one write, short enough that switching
// away feels already-saved.
const DEBOUNCE_MS = 1200;

type SourceField = "notes" | "project";

function sameCountByType(
  a: Record<QuestionType, number>,
  b: Record<QuestionType, number>,
): boolean {
  return QUESTION_TYPES.every((t) => a[t] === b[t]);
}

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
  const [countByType, setCountByType] = useState(reviewer.questionCountByType);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Browsers don't render text-overflow:ellipsis inside <input>, so an unfocused
  // topic is drawn as a real element on top of the (text-transparent) input.
  const [focusedTopic, setFocusedTopic] = useState<number | null>(null);

  // The source fields autosave on their own debounce rather than waiting for
  // "Save details" — they're the two fields a generation reads, and the old
  // Sources tab saved them this way before it was folded in here.
  const [notesStatus, setNotesStatus] = useState<SaveStatus>("idle");
  const [projectStatus, setProjectStatus] = useState<SaveStatus>("idle");
  const notesRef = useRef(reviewer.notes);
  const projectRef = useRef(reviewer.projectMaterial);
  const timers = useRef<Partial<Record<SourceField, ReturnType<typeof setTimeout>>>>({});
  const saveNowRef = useRef<() => void>(() => {});
  const onSavedRef = useRef(onSaved);

  // Everything the sticky bar's Discard reverts, and everything a fresh
  // Reviewer has to re-seed — one path so the two can't drift apart.
  function resetFields() {
    setName(reviewer.reviewerName);
    setSubject(reviewer.subject);
    setTopics(reviewer.topics.length ? reviewer.topics : [""]);
    setCountByType(reviewer.questionCountByType);
    setNameError(false);
    setError("");
  }

  // Re-seeds the fields from storage whenever the parent hands down a changed
  // Reviewer — a sibling tab's save, or a generation finishing. Syncing local
  // form state to an external store is what this effect is for, so the setState
  // is deliberate rather than the cascading-render case the rule targets.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(reviewer.reviewerName);
    setSubject(reviewer.subject);
    setTopics(reviewer.topics.length ? reviewer.topics : [""]);
    setCountByType(reviewer.questionCountByType);
  }, [
    reviewer.id,
    reviewer.reviewerName,
    reviewer.subject,
    reviewer.topics,
    reviewer.questionCountByType,
  ]);

  useEffect(() => {
    notesRef.current = reviewer.notes;
    projectRef.current = reviewer.projectMaterial;
  }, [reviewer.id, reviewer.notes, reviewer.projectMaterial]);

  // `updateReviewer` re-reads before writing, so an autosave here can't revert
  // questions added by a generation that finished while the user was typing.
  useEffect(() => {
    saveNowRef.current = () => {
      updateReviewer(reviewer.id, {
        notes: notesRef.current,
        projectMaterial: projectRef.current,
      });
    };
    onSavedRef.current = onSaved;
  });

  // Flush a pending debounce on unmount — switching tabs must not drop edits.
  // The parent has to be told too: it hands every sibling tab its own copy of
  // the Reviewer, and a flush that writes silently leaves those copies stale.
  useEffect(
    () => () => {
      const pending = timers.current;
      const hadPending = Boolean(pending.notes || pending.project);
      if (pending.notes) clearTimeout(pending.notes);
      if (pending.project) clearTimeout(pending.project);
      if (hadPending) {
        saveNowRef.current();
        onSavedRef.current();
      }
      clearTimeout(savedTimer.current);
    },
    [],
  );

  function flushSource(field: SourceField) {
    delete timers.current[field];
    saveNowRef.current();
    onSaved();
    if (field === "notes") setNotesStatus("saved");
    else setProjectStatus("saved");
  }

  function handleSourceChange(field: SourceField, value: string, immediate?: boolean) {
    if (field === "notes") {
      notesRef.current = value;
      setNotesStatus("saving");
    } else {
      projectRef.current = value;
      setProjectStatus("saving");
    }

    clearTimeout(timers.current[field]);
    if (immediate) {
      flushSource(field);
    } else {
      timers.current[field] = setTimeout(() => flushSource(field), DEBOUNCE_MS);
    }
  }

  // Derived, never stored separately — the per-type fields are the setting.
  const questionCount = sumCounts(countByType);

  const dirty =
    name !== reviewer.reviewerName ||
    subject !== reviewer.subject ||
    topics.join("\n") !== (reviewer.topics.length ? reviewer.topics : [""]).join("\n") ||
    // Compared per type, not just by total, so re-splitting the same number of
    // questions across types still counts as a change worth saving.
    !sameCountByType(countByType, reviewer.questionCountByType);

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
    // Cleared up front so a fixed problem's message doesn't linger in the
    // sticky bar and resurface on the next edit.
    setError("");
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(true);
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

    // Re-reads before writing, so saving details can't revert a source-field
    // autosave (or questions added by a generation) since this render.
    updateReviewer(reviewer.id, {
      reviewerName: trimmed,
      subject: subject.trim(),
      topics: topics.map((t) => t.trim()).filter(Boolean),
      questionCount,
      questionCountByType: countByType,
    });
    onSaved();
    setJustSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setJustSaved(false), 2000);
  }

  return (
    // The bar is fixed, so the tab reserves its height as scrollable slack —
    // enough that the last field can always be scrolled clear of it. It's
    // taller on mobile, where the bar's contents stack.
    <div className={`flex flex-col ${dirty || justSaved ? "pb-36 sm:pb-24" : ""}`}>
      <div className="grid grid-cols-1 gap-6 py-6 md:grid-cols-[160px_1fr]">
        <div>
          <p className="text-[15px] font-medium text-text-primary">Reviewer info</p>
          <p className="mt-1 text-[14px] text-text-secondary">Name and subject for this reviewer.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[14px] text-text-secondary">
              Reviewer name <span className="text-error">*</span>
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(false);
              }}
              placeholder="e.g. CPU Scheduling"
              className={`h-11 rounded-lg border px-3 text-text-primary outline-none focus:ring-2 focus:ring-accent/20 ${
                nameError ? "border-error focus:border-error" : "border-border focus:border-accent"
              }`}
            />
            {nameError && <span className="text-[13px] text-error">Reviewer name is required.</span>}
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

      <div className="grid grid-cols-1 gap-6 border-t border-border py-6 md:grid-cols-[160px_1fr]">
        <div>
          <p className="text-[15px] font-medium text-text-primary">Topics</p>
          <p className="mt-1 text-[14px] text-text-secondary">
            Optional. Weights question generation toward these topics.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
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
            className="col-span-full flex h-11 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong text-[15px] font-medium text-text-secondary hover:border-accent hover:text-accent"
          >
            + Add topic
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 border-t border-border py-6 md:grid-cols-[160px_1fr]">
        <div>
          <p className="text-[15px] font-medium text-text-primary">Question count</p>
          <p className="mt-1 text-[14px] text-text-secondary">How many questions to generate.</p>
        </div>
        <QuestionCountControl value={countByType} onChange={setCountByType} />
      </div>

      <SourceSections
        reviewerId={reviewer.id}
        notes={reviewer.notes}
        projectMaterial={reviewer.projectMaterial}
        onNotesChange={(text, immediate) => handleSourceChange("notes", text, immediate)}
        onProjectChange={(text, immediate) => handleSourceChange("project", text, immediate)}
        notesStatus={notesStatus}
        projectStatus={projectStatus}
      />

      <div className="flex flex-col gap-3 rounded-lg border border-error px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
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

      {/* Fixed rather than sticky: the actions stay reachable from anywhere on
          a long Details tab, not just once its end scrolls into view. */}
      {(dirty || justSaved) && (
        <div className="fixed inset-x-0 bottom-0 z-40">
          {/* Mirrors the page wrapper's own `max-w-4xl px-6` so the bar's edges
              land on the same line as the dividers and inputs above it. */}
          <div className="mx-auto w-full max-w-4xl px-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {dirty ? (
              // Stacked below `sm`: side by side, the message gets squeezed to a
              // few characters per line by the two buttons and the bar grows
              // taller than the stacked version it's avoiding.
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-5 py-4 shadow-menu sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                {/* A failed save leaves the bar up, so its own status line is the
                    only place a validation message is certain to be seen. */}
                <span className={`text-[15px] ${error ? "text-error" : "text-text-secondary"}`}>
                  {error || "You have unsaved changes"}
                </span>
                <div className="flex shrink-0 items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={resetFields}
                    className="rounded-lg px-4 py-2.5 text-[15px] font-medium text-text-secondary hover:bg-surface-alt hover:text-text-primary"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!name.trim()}
                    title={name.trim() ? undefined : "Reviewer name is required"}
                    className="rounded-lg bg-accent px-4 py-2.5 text-[15px] font-medium text-white enabled:hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Save details
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-end rounded-lg border border-border bg-surface px-5 py-4 shadow-menu">
                <span className="text-[15px] text-success">✓ Saved</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
