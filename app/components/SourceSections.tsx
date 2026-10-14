"use client";

import ContentField from "@/app/components/ContentField";
import type { AttachmentField } from "@/app/lib/attachments";

export type SaveStatus = "idle" | "saving" | "saved";

// The two source fields as settings-rows, matching the Details tab's
// label-left / control-right rhythm. Deliberately presentational: the Details
// tab autosaves each field to storage as it changes, while the New Reviewer
// screen just holds the text until the reviewer is created, so persistence
// stays with the caller and only the layout is shared.
function SourceRow({
  title,
  description,
  status,
  reviewerId,
  field,
  initialText,
  onChange,
  placeholder,
  surfaceClassName,
}: {
  title: string;
  description: string;
  status: SaveStatus;
  reviewerId: string;
  field: AttachmentField;
  initialText: string;
  onChange: (text: string, immediate?: boolean) => void;
  placeholder: string;
  surfaceClassName: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 border-t border-border py-6 md:grid-cols-[160px_1fr]">
      <div>
        <p className="text-[0.9375rem] font-medium text-text-primary">{title}</p>
        <p className="mt-1 text-[0.875rem] text-text-secondary">{description}</p>
        {status === "saving" && <p className="mt-1 text-[0.875rem] text-text-tertiary">Saving…</p>}
        {status === "saved" && <p className="mt-1 text-[0.875rem] text-success">✓ Saved</p>}
      </div>
      <ContentField
        key={`${reviewerId}-${field}`}
        initialText={initialText}
        onChange={onChange}
        placeholder={placeholder}
        surfaceClassName={surfaceClassName}
        reviewerId={reviewerId}
        field={field}
      />
    </div>
  );
}

export default function SourceSections({
  reviewerId,
  notes,
  projectMaterial,
  pastExamMaterial,
  onNotesChange,
  onProjectChange,
  onPastExamChange,
  notesStatus = "idle",
  projectStatus = "idle",
  pastExamStatus = "idle",
}: {
  reviewerId: string;
  // The initial text only — ContentField owns the textarea from mount, so
  // these are read once per `reviewerId` rather than on every render.
  notes: string;
  projectMaterial: string;
  pastExamMaterial: string;
  onNotesChange: (text: string, immediate?: boolean) => void;
  onProjectChange: (text: string, immediate?: boolean) => void;
  onPastExamChange: (text: string, immediate?: boolean) => void;
  notesStatus?: SaveStatus;
  projectStatus?: SaveStatus;
  pastExamStatus?: SaveStatus;
}) {
  return (
    <>
      <SourceRow
        title="Course material"
        description="Optional. Use for lecture notes and slides. This is the main source of facts."
        status={notesStatus}
        reviewerId={reviewerId}
        field="notes"
        initialText={notes}
        onChange={onNotesChange}
        placeholder="Paste your lecture notes or slide text here..."
        surfaceClassName="bg-surface"
      />
      <SourceRow
        title="Project material"
        description="Optional. Use for specs, assignments, or code the exam may cover."
        status={projectStatus}
        reviewerId={reviewerId}
        field="project"
        initialText={projectMaterial}
        onChange={onProjectChange}
        placeholder="Paste specs, code, or other project material here..."
        surfaceClassName="bg-surface-alt"
      />
      <SourceRow
        title="Past exam"
        description="Optional. A sample exam. Use it to teach the format and supply facts."
        status={pastExamStatus}
        reviewerId={reviewerId}
        field="pastexam"
        initialText={pastExamMaterial}
        onChange={onPastExamChange}
        placeholder="Paste a past exam here, or upload it as PDF or photos..."
        surfaceClassName="bg-surface"
      />
    </>
  );
}
