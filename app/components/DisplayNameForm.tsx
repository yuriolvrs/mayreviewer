"use client";

import { useId, useState } from "react";
import { formatHandle, saveProfile, validateProfileInput, type Profile } from "@/app/lib/profile";

// Shared by the Account page and the sign-in prompt. Fields read as
// `Name` `#` `tag`. The user picks both.
export default function DisplayNameForm({
  initial,
  onSaved,
  submitLabel = "Save",
  firstFieldRef,
  extraActions,
}: {
  initial: Profile | null;
  onSaved: (profile: Profile) => void;
  submitLabel?: string;
  firstFieldRef?: React.Ref<HTMLInputElement>;
  extraActions?: React.ReactNode;
}) {
  const id = useId();
  const [name, setName] = useState(initial?.displayName ?? "");
  const [tag, setTag] = useState(initial?.tag ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const unchanged = initial !== null && name.trim() === initial.displayName && tag === initial.tag;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const invalid = validateProfileInput(name, tag);
    if (invalid) {
      setError(invalid);
      setSaved(false);
      return;
    }
    setError(null);
    setSaved(false);
    setSaving(true);
    const result = await saveProfile(name, tag);
    setSaving(false);
    if (result.ok) {
      setSaved(true);
      onSaved({ displayName: name.trim(), tag });
    } else if (result.taken) {
      setError(`${formatHandle(name.trim(), tag)} is taken, try another tag.`);
    } else {
      setError(result.error);
    }
  }

  const inputClass =
    "h-11 min-w-0 rounded-lg border border-border bg-surface px-2 py-2 text-[0.9375rem] text-text-primary outline-none focus:border-accent";

  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,5.5rem)] items-center gap-2">
        <input
          ref={firstFieldRef}
          id={`${id}-name`}
          aria-label="Display name"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          maxLength={32}
          autoComplete="nickname"
          placeholder="Name"
          className={`${inputClass} w-full`}
        />
        <span aria-hidden="true" className="text-[1.0625rem] text-text-secondary">
          #
        </span>
        <input
          id={`${id}-tag`}
          aria-label="Tag"
          type="text"
          value={tag}
          onChange={(e) => {
            setTag(e.target.value.replace(/[^A-Za-z0-9]/g, ""));
            setSaved(false);
          }}
          maxLength={5}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="tag"
          className={`${inputClass} w-full`}
        />
      </div>
      {error && (
        <p role="alert" className="text-[0.875rem] font-medium text-error">
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="text-[0.875rem] text-text-secondary">
          Saved.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {extraActions}
        <button
          type="submit"
          disabled={saving || unchanged}
          className="min-h-[44px] rounded-lg bg-accent px-4 py-2 text-[0.9375rem] font-medium text-on-accent hover:bg-accent-hover disabled:opacity-40"
        >
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
