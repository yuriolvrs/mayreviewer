"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { updateReviewer } from "@/app/lib/storage";
import {
  MAX_ID_CHARS,
  defaultCounts,
  formatTypeKeys,
  newFormatId,
  resolveFromList,
  saveCustomFormat,
  type ExamFormat,
  type FormatTypeDef,
} from "@/app/lib/examFormats";
import { useFormats } from "@/app/lib/useFormats";
import {
  MAX_QUESTION_COUNT,
  MIN_QUESTION_COUNT,
  sumCounts,
} from "@/app/lib/questions";
import ReviewerInfoFields from "@/app/components/ReviewerInfoFields";
import TopicsField from "@/app/components/TopicsField";
import { FormatPicker, QuestionCountSection } from "@/app/components/FormatPicker";
import GeneratedFormatPanel from "@/app/components/GeneratedFormatPanel";
import SourceSections, { type SaveStatus } from "@/app/components/SourceSections";
import { useTopicList } from "@/app/lib/useTopics";
import { useUnsavedGuard } from "@/app/lib/useUnsavedGuard";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import type { Reviewer } from "@/app/types";

// Long enough that a burst of typing is one write, short enough that switching
// away feels already-saved.
const DEBOUNCE_MS = 1200;

type SourceField = "notes" | "project" | "pastexam";

function sameCountByType(
  a: Record<string, number>,
  b: Record<string, number>,
  types: string[],
): boolean {
  return types.every((t) => a[t] === b[t]);
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
  const topicList = useTopicList(reviewer.topics);
  const { reset: resetTopics } = topicList;
  const topics = topicList.values();
  const [countByType, setCountByType] = useState(reviewer.questionCountByType);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The source fields autosave on their own debounce rather than waiting for
  // "Save details" — they're the two fields a generation reads, and the old
  // Sources tab saved them this way before it was folded in here.
  const [notesStatus, setNotesStatus] = useState<SaveStatus>("idle");
  const [projectStatus, setProjectStatus] = useState<SaveStatus>("idle");
  const [pastExamStatus, setPastExamStatus] = useState<SaveStatus>("idle");
  const notesRef = useRef(reviewer.notes);
  const projectRef = useRef(reviewer.projectMaterial);
  const pastExamRef = useRef(reviewer.pastExamMaterial);
  const timers = useRef<Partial<Record<SourceField, ReturnType<typeof setTimeout>>>>({});
  const saveNowRef = useRef<() => void>(() => {});
  const onSavedRef = useRef(onSaved);

  // Everything the sticky bar's Discard reverts, and everything a fresh
  // Reviewer has to re-seed — one path so the two can't drift apart.
  function resetFields() {
    setName(reviewer.reviewerName);
    setSubject(reviewer.subject);
    resetTopics(reviewer.topics);
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
    resetTopics(reviewer.topics);
    setCountByType(reviewer.questionCountByType);
  }, [
    reviewer.id,
    reviewer.reviewerName,
    reviewer.subject,
    reviewer.topics,
    reviewer.questionCountByType,
    resetTopics,
  ]);

  useEffect(() => {
    notesRef.current = reviewer.notes;
    projectRef.current = reviewer.projectMaterial;
    pastExamRef.current = reviewer.pastExamMaterial;
  }, [reviewer.id, reviewer.notes, reviewer.projectMaterial, reviewer.pastExamMaterial]);

  // `updateReviewer` re-reads before writing, so an autosave here can't revert
  // questions added by a generation that finished while the user was typing.
  useEffect(() => {
    saveNowRef.current = () => {
      updateReviewer(reviewer.id, {
        notes: notesRef.current,
        projectMaterial: projectRef.current,
        pastExamMaterial: pastExamRef.current,
      });
    };
    onSavedRef.current = onSaved;
  });

  // Phones freeze or kill a backgrounded page without unmounting it, so the
  // unmount flush below never runs there. Flush when the page is hidden too.
  useEffect(() => {
    function onHidden() {
      if (!document.hidden) return;
      const pending = timers.current;
      if (!pending.notes && !pending.project && !pending.pastexam) return;
      clearTimeout(pending.notes);
      clearTimeout(pending.project);
      clearTimeout(pending.pastexam);
      timers.current = {};
      saveNowRef.current();
      onSavedRef.current();
      // Same end state as flushSource, for every field at once.
      if (pending.notes) setNotesStatus("saved");
      if (pending.project) setProjectStatus("saved");
      if (pending.pastexam) setPastExamStatus("saved");
    }
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, []);

  // Flush a pending debounce on unmount — switching tabs must not drop edits.
  // The parent has to be told too: it hands every sibling tab its own copy of
  // the Reviewer, and a flush that writes silently leaves those copies stale.
  useEffect(
    () => () => {
      const pending = timers.current;
      const hadPending = Boolean(pending.notes || pending.project || pending.pastexam);
      if (pending.notes) clearTimeout(pending.notes);
      if (pending.project) clearTimeout(pending.project);
      if (pending.pastexam) clearTimeout(pending.pastexam);
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
    else if (field === "project") setProjectStatus("saved");
    else setPastExamStatus("saved");
  }

  function handleSourceChange(field: SourceField, value: string, immediate?: boolean) {
    if (field === "notes") {
      notesRef.current = value;
      setNotesStatus("saving");
    } else if (field === "project") {
      projectRef.current = value;
      setProjectStatus("saving");
    } else {
      pastExamRef.current = value;
      setPastExamStatus("saving");
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

  // The reviewer's format decides which count fields exist. Counts typed for
  // another format's types are meaningless after a switch, so changing format
  // re-seeds from the new format's defaults (saved immediately, like the
  // switch itself).
  const baseFormats = useFormats();
  // A format saved by "Learn from my material" is not in the hook's list until
  // the next mount, so it is merged in here to resolve at once.
  const [appliedFormat, setAppliedFormat] = useState<ExamFormat | null>(null);
  const formats = useMemo(
    () =>
      appliedFormat && !baseFormats.some((f) => f.id === appliedFormat.id)
        ? [...baseFormats, appliedFormat]
        : baseFormats,
    [baseFormats, appliedFormat],
  );
  const format = resolveFromList(formats, reviewer.examFormatId);
  const typeKeys = formatTypeKeys(format);

  // "Learn from my material": a draft format. It is stored only when the
  // student applies it, and keeps one id so applying twice overwrites.
  const [learn, setLearn] = useState(false);
  const [genTypes, setGenTypes] = useState<FormatTypeDef[]>([]);
  const [genCounts, setGenCounts] = useState<Record<string, number>>({});
  const [genName, setGenName] = useState("");
  const [genId] = useState(() => newFormatId());
  const [genSaved, setGenSaved] = useState(false);
  const genDefaultName = `${name.trim() || "New reviewer"} format`.slice(0, MAX_ID_CHARS);
  const learnPending = learn && genTypes.length === 0;
  const learnTotal = sumCounts(genCounts);

  // Either a saved format id, or the learn-mode draft.
  const [pendingFormat, setPendingFormat] = useState<{ id: string } | "learn" | null>(null);

  function applyFormat(id: string) {
    const next = resolveFromList(formats, id);
    updateReviewer(reviewer.id, {
      examFormatId: next.id,
      questionCountByType: defaultCounts(next),
    });
    setCountByType(defaultCounts(next));
    onSaved();
  }

  // The draft is saved as a custom format, becomes this reviewer's format, and
  // its counts replace the current ones.
  function applyLearn() {
    const stored: ExamFormat = {
      id: genId,
      name: genName.trim() || genDefaultName,
      description: "",
      types: genTypes.map((t) => ({
        ...t,
        label: t.label.trim(),
        defaultCount: genCounts[t.key] ?? t.defaultCount,
      })),
    };
    saveCustomFormat(stored);
    setAppliedFormat(stored);
    updateReviewer(reviewer.id, {
      examFormatId: stored.id,
      questionCountByType: genCounts,
    });
    setCountByType(genCounts);
    setLearn(false);
    setGenSaved(true);
    onSaved();
  }

  // Counts the student changed are lost on a switch, so ask first. Untouched
  // defaults switch silently.
  function countsEdited() {
    const defaults = defaultCounts(format);
    return typeKeys.some((t) => (countByType[t] ?? 0) !== (defaults[t] ?? 0));
  }

  function changeFormat(id: string) {
    setLearn(false);
    if (id === format.id) return;
    if (countsEdited()) setPendingFormat({ id });
    else applyFormat(id);
  }

  function requestApplyLearn() {
    if (genTypes.length === 0 || genTypes.some((t) => !t.label.trim())) return;
    if (countsEdited()) setPendingFormat("learn");
    else applyLearn();
  }

  const dirty =
    name !== reviewer.reviewerName ||
    subject !== reviewer.subject ||
    topics.join("\n") !== (reviewer.topics.length ? reviewer.topics : [""]).join("\n") ||
    // Compared per type, not just by total, so re-splitting the same number of
    // questions across types still counts as a change worth saving.
    !sameCountByType(countByType, reviewer.questionCountByType, typeKeys);

  useUnsavedGuard(dirty);

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
      <ReviewerInfoFields
        name={name}
        subject={subject}
        nameError={nameError}
        onNameChange={(v) => {
          setName(v);
          if (nameError) setNameError(false);
        }}
        onSubjectChange={setSubject}
      />

      <SourceSections
        reviewerId={reviewer.id}
        notes={reviewer.notes}
        projectMaterial={reviewer.projectMaterial}
        pastExamMaterial={reviewer.pastExamMaterial}
        onNotesChange={(text, immediate) => handleSourceChange("notes", text, immediate)}
        onProjectChange={(text, immediate) => handleSourceChange("project", text, immediate)}
        onPastExamChange={(text, immediate) => handleSourceChange("pastexam", text, immediate)}
        notesStatus={notesStatus}
        projectStatus={projectStatus}
        pastExamStatus={pastExamStatus}
      />

      {/* Format changes save at once rather than through the sticky bar: they
          never conflict with the staged name/subject/topics/counts edits. */}
      <FormatPicker
        learn={learn}
        formats={formats}
        format={format}
        onSelectSaved={changeFormat}
        onSelectLearn={() => setLearn(true)}
        learnPanel={
          <GeneratedFormatPanel
            reviewerId={reviewer.id}
            notes={reviewer.notes}
            pastExam={reviewer.pastExamMaterial}
            subject={subject || name}
            types={genTypes}
            counts={genCounts}
            onChange={(types, counts) => {
              setGenTypes(types);
              setGenCounts(counts);
              setGenSaved(false);
            }}
            formatName={genName}
            defaultName={genDefaultName}
            onNameChange={(v) => {
              setGenName(v);
              setGenSaved(false);
            }}
            onSave={requestApplyLearn}
            saved={genSaved}
            saveLabel="Use this format"
            savedText="Format applied."
          />
        }
      />

      <QuestionCountSection
        learn={learn}
        learnPending={learnPending}
        total={learnTotal}
        format={format}
        value={countByType}
        onChange={setCountByType}
      />

      <TopicsField topicList={topicList} />

      <div className="flex flex-col gap-3 rounded-lg border border-error px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[0.9375rem] font-semibold text-error">Danger zone</p>
          <p className="mt-1 text-[0.875rem] text-text-secondary">
            Deleting this reviewer removes all of its questions and content. This can&apos;t be undone.
          </p>
        </div>
        <button
          onClick={onDeleteRequest}
          className="shrink-0 rounded-lg border border-error px-4 py-2 text-[0.9375rem] font-medium text-error hover:bg-error hover:text-on-error"
        >
          Delete reviewer
        </button>
      </div>

      {/* Fixed rather than sticky: the actions stay reachable from anywhere on
          a long Details tab, not just once its end scrolls into view. */}
      {(dirty || justSaved) && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 md:bottom-0">
          {/* Mirrors the page wrapper's own `max-w-4xl px-6` so the bar's edges
              land on the same line as the dividers and inputs above it. */}
          <div className="mx-auto w-full max-w-4xl px-6 pb-3 md:pb-[max(1rem,env(safe-area-inset-bottom))]">
            {dirty ? (
              // Stacked below `sm`: side by side, the message gets squeezed to a
              // few characters per line by the two buttons and the bar grows
              // taller than the stacked version it's avoiding.
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-5 py-4 shadow-menu sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                {/* A failed save leaves the bar up, so its own status line is the
                    only place a validation message is certain to be seen. */}
                <span className={`text-[0.9375rem] ${error ? "text-error" : "text-text-secondary"}`}>
                  {error || "You have unsaved changes"}
                </span>
                <div className="flex shrink-0 items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={resetFields}
                    className="min-h-11 rounded-lg px-4 py-2.5 text-[0.9375rem] font-medium text-text-secondary hover:bg-surface-alt hover:text-text-primary"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!name.trim()}
                    title={name.trim() ? undefined : "Reviewer name is required"}
                    className="min-h-11 rounded-lg bg-accent px-4 py-2.5 text-[0.9375rem] font-medium text-on-accent enabled:hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Save details
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-end rounded-lg border border-border bg-surface px-5 py-4 shadow-menu">
                <span className="text-[0.9375rem] text-success">✓ Saved</span>
              </div>
            )}
          </div>
        </div>
      )}

      {pendingFormat && (
        <ConfirmDialog
          title="Switch format?"
          body="Switching formats resets your question counts to the new format's defaults."
          confirmLabel="Switch format"
          onConfirm={() => {
            if (pendingFormat === "learn") applyLearn();
            else applyFormat(pendingFormat.id);
            setPendingFormat(null);
          }}
          onCancel={() => setPendingFormat(null)}
        />
      )}
    </div>
  );
}
