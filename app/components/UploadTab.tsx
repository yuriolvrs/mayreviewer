"use client";

import { useEffect, useRef, useState } from "react";
import { getReviewer, saveReviewer } from "@/app/lib/storage";
import type { Question, Reviewer } from "@/app/types";
import ContentField, { type SaveStatus } from "@/app/components/ContentField";
import GenerateBar from "@/app/components/GenerateBar";

const DEBOUNCE_MS = 1200;

type Field = "notes" | "project";

export default function UploadTab({
  reviewer,
  onSaved,
}: {
  reviewer: Reviewer;
  onSaved: () => void;
}) {
  const [notes, setNotes] = useState(reviewer.notes);
  const [projectMaterial, setProjectMaterial] = useState(reviewer.projectMaterial);
  const [notesStatus, setNotesStatus] = useState<SaveStatus>("idle");
  const [projectStatus, setProjectStatus] = useState<SaveStatus>("idle");

  const notesRef = useRef(reviewer.notes);
  const projectRef = useRef(reviewer.projectMaterial);
  const timers = useRef<Partial<Record<Field, ReturnType<typeof setTimeout>>>>({});
  const saveNowRef = useRef<() => void>(() => {});

  useEffect(() => {
    // Reset when switching to a different Reviewer; ContentField re-mounts via key below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotes(reviewer.notes);
    setProjectMaterial(reviewer.projectMaterial);
    notesRef.current = reviewer.notes;
    projectRef.current = reviewer.projectMaterial;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewer.id]);

  // Re-read from storage at write time so an autosave can't clobber questions
  // added by a generation that finished while the user was typing.
  useEffect(() => {
    saveNowRef.current = () => {
      const current = getReviewer(reviewer.id);
      if (!current) return;
      saveReviewer({
        ...current,
        notes: notesRef.current,
        projectMaterial: projectRef.current,
      });
    };
  });

  // Flush a pending debounce on unmount — switching tabs must not drop edits.
  // The parent has to be told too: it hands every sibling tab its own copy of
  // the Reviewer, and a flush that writes silently leaves those copies stale,
  // so the next tab's save reverts whatever was just typed here.
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  });

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
    },
    [],
  );

  function flush(field: Field) {
    delete timers.current[field];
    saveNowRef.current();
    onSaved();
    if (field === "notes") setNotesStatus("saved");
    else setProjectStatus("saved");
  }

  function handleChange(field: Field, value: string, immediate?: boolean) {
    if (field === "notes") {
      notesRef.current = value;
      setNotes(value);
      setNotesStatus("saving");
    } else {
      projectRef.current = value;
      setProjectMaterial(value);
      setProjectStatus("saving");
    }

    clearTimeout(timers.current[field]);
    if (immediate) {
      flush(field);
    } else {
      timers.current[field] = setTimeout(() => flush(field), DEBOUNCE_MS);
    }
  }

  // "Generate questions" replaces the pool (confirmed via GenerateBar's
  // overwrite modal when questions already exist); "Fill to N" appends up to
  // the limit. Either way the write lands on completion, not before, so a
  // failed generation leaves the existing questions intact.
  function handleGenerated(newQuestions: Question[], mode: "replace" | "append") {
    const current = getReviewer(reviewer.id);
    if (!current) return;
    saveReviewer({
      ...current,
      notes: notesRef.current,
      projectMaterial: projectRef.current,
      questions: mode === "append" ? [...current.questions, ...newQuestions] : newQuestions,
    });
    onSaved();
  }

  // Same field the Details tab edits, so changing it in either place sticks.
  function handleCountChange(questionCount: number) {
    const current = getReviewer(reviewer.id);
    if (!current) return;
    saveReviewer({
      ...current,
      notes: notesRef.current,
      projectMaterial: projectRef.current,
      questionCount,
    });
    onSaved();
  }

  const saving = notesStatus === "saving" || projectStatus === "saving";

  return (
    <div className="flex flex-col gap-6">
      <ContentField
        key={`${reviewer.id}-notes`}
        label="Course material - notes and slides"
        initialText={reviewer.notes}
        onChange={(text, immediate) => handleChange("notes", text, immediate)}
        placeholder="Paste your lecture notes or slide text here..."
        surfaceClassName="bg-surface"
        reviewerId={reviewer.id}
        field="notes"
        status={notesStatus}
      />

      <ContentField
        key={`${reviewer.id}-project`}
        label="Project material - specs and code"
        initialText={reviewer.projectMaterial}
        onChange={(text, immediate) => handleChange("project", text, immediate)}
        placeholder="Paste specs, code, or other project material here..."
        surfaceClassName="bg-surface-alt"
        reviewerId={reviewer.id}
        field="project"
        status={projectStatus}
      />

      <GenerateBar
        reviewer={{ ...reviewer, notes, projectMaterial }}
        onGenerated={handleGenerated}
        onCountChange={handleCountChange}
        saveLabel={saving ? "Saving…" : "All changes saved"}
      />
    </div>
  );
}
