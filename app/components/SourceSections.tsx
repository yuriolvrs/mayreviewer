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
        <p className="text-[15px] font-medium text-text-primary">{title}</p>
        <p className="mt-1 text-[14px] text-text-secondary">{description}</p>
        {status === "saving" && <p className="mt-1 text-[14px] text-text-tertiary">Saving…</p>}
        {status === "saved" && <p className="mt-1 text-[14px] text-success">✓ Saved</p>}
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
  onNotesChange,
  onProjectChange,
  notesStatus = "idle",
  projectStatus = "idle",
}: {
  reviewerId: string;
  // The initial text only — ContentField owns the textarea from mount, so
  // these are read once per `reviewerId` rather than on every render.
  notes: string;
  projectMaterial: string;
  onNotesChange: (text: string, immediate?: boolean) => void;
  onProjectChange: (text: string, immediate?: boolean) => void;
  notesStatus?: SaveStatus;
  projectStatus?: SaveStatus;
}) {
  return (
    <>
      <SourceRow
        title="Course material"
        description="Notes and slides."
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
        description="Specs and code."
        status={projectStatus}
        reviewerId={reviewerId}
        field="project"
        initialText={projectMaterial}
        onChange={onProjectChange}
        placeholder="Paste specs, code, or other project material here..."
        surfaceClassName="bg-surface-alt"
      />
    </>
  );
}
