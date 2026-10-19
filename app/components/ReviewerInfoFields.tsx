"use client";

// Name and subject. Shared by New Reviewer and the Details tab so the two
// screens read the same. The caller owns the state and the validation.
export default function ReviewerInfoFields({
  name,
  subject,
  nameError,
  onNameChange,
  onSubjectChange,
  onNameBlur,
  autoFocus,
}: {
  name: string;
  subject: string;
  nameError: boolean;
  onNameChange: (value: string) => void;
  onSubjectChange: (value: string) => void;
  onNameBlur?: () => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 pb-6 md:grid-cols-[160px_1fr]">
      <div>
        <p className="text-[0.9375rem] font-medium text-text-primary">Reviewer info</p>
        <p className="mt-1 text-[0.875rem] text-text-secondary">Name and subject for this reviewer.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.875rem] text-text-secondary">
            Reviewer name <span className="text-error">*</span>
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. Unit 2 review"
            className={`h-11 rounded-lg border px-3 text-text-primary outline-none ${
              nameError ? "border-error focus:border-error" : "border-border focus:border-accent"
            }`}
            onBlur={onNameBlur}
            autoFocus={autoFocus}
          />
          {nameError && <span className="text-[0.8125rem] text-error">Reviewer name is required.</span>}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.875rem] text-text-secondary">Subject (optional)</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => onSubjectChange(e.target.value)}
            placeholder="e.g. Algebra 1"
            className="h-11 rounded-lg border border-border px-3 text-text-primary outline-none focus:border-accent"
          />
        </label>
      </div>
    </div>
  );
}
