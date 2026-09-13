"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { removeReviewerCompletely } from "@/app/lib/reviewers";
import { MAX_QUESTION_COUNT, MIN_QUESTION_COUNT } from "@/app/lib/questions";
import { DEFAULT_SETTINGS, getSettings, updateSettings } from "@/app/lib/settings";
import { getAllQuizHistory, getReviewers } from "@/app/lib/storage";
import type { FeedbackMode, ThemePreference, UserSettings } from "@/app/types";

// Sections sit closer to their rows than to the section above: generous
// margin on top, tight gap below. Rows are bound by hairline dividers only —
// no cards, no nested containers.
function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-[15px] font-semibold text-text-primary">{title}</h2>
      {note && <p className="mt-0.5 text-[13px] text-text-secondary">{note}</p>}
      <div className="mt-2 border-t border-border">{children}</div>
    </section>
  );
}

// Label left, control right in a fixed 200px gutter so every control starts
// at the same x. Stacks on narrow screens. Hints use secondary — tertiary
// fails contrast at this size.
function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[60px] flex-wrap items-center gap-x-4 gap-y-2 border-b border-border py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-medium text-text-primary">{label}</div>
        {hint && <div className="mt-px text-[13px] text-text-secondary">{hint}</div>}
      </div>
      <div className="flex w-[200px] flex-none items-center justify-end max-sm:w-full max-sm:justify-start">
        {children}
      </div>
    </div>
  );
}

// Whole row is the hit target: the checkbox stays native (keyboard works)
// and the track is styled off `peer-checked:`.
function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-[60px] cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 border-b border-border py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-text-primary">{label}</span>
        {hint && <span className="mt-px block text-[13px] text-text-secondary">{hint}</span>}
      </span>
      <span className="flex w-[200px] flex-none items-center justify-end max-sm:w-auto">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          aria-hidden="true"
          className="flex h-7 w-12 items-center rounded-full border border-border-strong bg-surface-alt px-0.5 peer-checked:justify-end peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
        >
          <span className="h-[22px] w-[22px] rounded-full bg-white" />
        </span>
      </span>
    </label>
  );
}

const FEEDBACK_MODES: { value: FeedbackMode; label: string; hint: string }[] = [
  {
    value: "immediate",
    label: "Show correct/incorrect immediately",
    hint: "Feedback appears as you answer.",
  },
  {
    value: "end-only",
    label: "Only show results at the end",
    hint: "Nothing is revealed until you submit.",
  },
];

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [storageUsed, setStorageUsed] = useState<string | null>(null);
  const [storageFull, setStorageFull] = useState(false);
  const [permission, setPermission] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // localStorage is a browser-only external store; one-off read on mount is intentional.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(getSettings());
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      navigator.storage
        .estimate()
        .then(({ usage, quota }) => {
          if (typeof usage === "number") {
            setStorageUsed(`${(usage / 1024 / 1024).toFixed(1)} MB used`);
            // Warn early: hitting the quota mid-save loses the write, and the
            // recovery is manual export-then-delete.
            if (typeof quota === "number" && quota > 0 && usage / quota >= 0.8) {
              setStorageFull(true);
            }
          }
        })
        .catch(() => {});
    }
    if (typeof Notification !== "undefined") setPermission(Notification.permission);
  }, []);

  function patch(p: Partial<UserSettings>) {
    setSettings(updateSettings(p));
  }

  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking on the same tick can abort the download in Firefox.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function exportAll() {
    const data = {
      exportedAt: new Date().toISOString(),
      settings,
      reviewers: getReviewers(),
      attempts: getAllQuizHistory(),
    };
    download(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "may-reviewer-backup.json");
    setNotice("Backup downloaded. Uploaded files stay on this device and are not included.");
  }

  async function deleteAll() {
    for (const r of getReviewers()) {
      await removeReviewerCompletely(r.id);
    }
    setConfirmingDelete(false);
    setNotice("All reviewers, questions, files, and quiz history were deleted on this device.");
  }

  async function enableReminders() {
    if (typeof Notification === "undefined") {
      setNotice("This browser does not support notifications.");
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      patch({ remindersEnabled: true });
    } else {
      setNotice("Notifications are blocked in the browser. Allow them to get reminders.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <h1 className="text-[26px] font-semibold text-text-primary">Settings</h1>
      <p className="mt-1 text-[15px] text-text-secondary">Study defaults, appearance, reminders, and your data.</p>

      {notice && <p role="status" className="mt-4 rounded-lg bg-surface-alt px-3 py-2 text-[14px] text-text-secondary">{notice}</p>}

      <div className="mt-6">
        <Section title="Study defaults">
          <fieldset>
            <legend className="pt-3 text-[15px] font-medium text-text-primary">Feedback mode</legend>
            <p className="mt-px text-[13px] text-text-secondary">Starting choice on new quizzes.</p>
            <div className="mt-1">
              {FEEDBACK_MODES.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-3 border-b border-border py-2.5 last:border-b-0"
                >
                  <input
                    type="radio"
                    name="feedback-mode"
                    checked={settings.feedbackMode === option.value}
                    onChange={() => patch({ feedbackMode: option.value })}
                    className="mt-1 h-[18px] w-[18px] flex-none accent-accent"
                  />
                  <span>
                    <span className="block text-[15px] font-medium text-text-primary">{option.label}</span>
                    <span className="mt-px block text-[13px] text-text-secondary">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <Row label="Default question count" hint={`1–${MAX_QUESTION_COUNT} per generation.`}>
            <input
              type="number"
              min={MIN_QUESTION_COUNT}
              max={MAX_QUESTION_COUNT}
              inputMode="numeric"
              value={settings.defaultCount}
              onChange={(e) => patch({ defaultCount: Number(e.target.value) })}
              aria-label="Default question count"
              className="h-11 w-full rounded-lg border border-border bg-surface px-2 py-2 text-[15px] text-text-primary outline-none focus:border-accent"
            />
          </Row>
          <ToggleRow
            label="Shuffle options"
            hint="New slot for the answer each attempt."
            checked={settings.shuffle}
            onChange={(shuffle) => patch({ shuffle })}
          />
        </Section>

        <Section title="Appearance">
          <Row label="Theme" hint="Follows your system when set to System.">
            <div
              role="group"
              aria-label="Theme"
              className="flex w-full gap-[3px] rounded-[10px] border border-border-strong bg-surface p-1.5"
            >
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => patch({ theme: t.value })}
                  aria-pressed={settings.theme === t.value}
                  className={`flex min-h-8 flex-1 items-center justify-center rounded-md px-2 py-1.5 text-[15px] ${
                    settings.theme === t.value
                      ? "bg-accent font-semibold text-on-accent"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Row>
          <ToggleRow
            label="Large text"
            hint="Bumps the base font size up."
            checked={settings.fontSize === "large"}
            onChange={(on) => patch({ fontSize: on ? "large" : "normal" })}
          />
          <ToggleRow
            label="Reduce motion"
            hint="Beyond the OS setting."
            checked={settings.reduceMotion}
            onChange={(reduceMotion) => patch({ reduceMotion })}
          />
        </Section>

        <Section
          title="Reminders"
          note={`Local only — no server, no push yet.${permission ? ` Browser permission: ${permission}.` : ""}`}
        >
          <ToggleRow
            label="Study reminders"
            hint="One nudge at your chosen time."
            checked={settings.remindersEnabled}
            onChange={(on) => {
              if (on) {
                void enableReminders();
              } else {
                patch({ remindersEnabled: false });
              }
            }}
          />
          <Row label="Reminder time">
            <input
              type="time"
              value={settings.reminderTime}
              disabled={!settings.remindersEnabled}
              onChange={(e) => patch({ reminderTime: e.target.value })}
              aria-label="Reminder time"
              className="h-11 w-full rounded-lg border border-border bg-surface px-2 py-2 text-[15px] text-text-primary outline-none focus:border-accent disabled:opacity-40"
            />
          </Row>
        </Section>

        <Section
          title="Data"
          note={`${storageUsed ?? "Storage use is unknown in this browser."} Reviewers, questions, and history live on this device only.`}
        >
          <div className="flex flex-wrap gap-3 py-4">
            <button
              onClick={exportAll}
              className="min-h-[44px] rounded-lg border border-border-strong px-4 py-2 text-[15px] font-medium text-text-primary"
            >
              Export all backup
            </button>
            <button
              onClick={() => setConfirmingDelete(true)}
              className="min-h-[44px] rounded-lg border border-error px-4 py-2 text-[15px] font-medium text-error"
            >
              Delete all local data
            </button>
          </div>
          {storageFull && (
            <p role="alert" className="border-b border-border pb-3 text-[14px] font-medium text-warning">
              Storage is over 80% full — export a backup, then delete old reviewers to free space.
            </p>
          )}
        </Section>

        <Section title="Plan">
          <p className="border-b border-border py-3 text-[15px] text-text-secondary">
            Free plan. Paid options may arrive later — nothing is gated now.
          </p>
        </Section>

        <Section title="About and legal">
          <Link
            href="/about"
            className="flex min-h-[44px] items-center border-b border-border py-2 text-[15px] font-medium text-accent underline"
          >
            About May Reviewer
          </Link>
          <div className="flex min-h-[44px] flex-wrap items-center gap-x-2 border-b border-border py-2 text-[15px]">
            <Link href="/privacy" className="font-medium text-accent underline">
              Privacy Policy
            </Link>
            <span className="text-text-tertiary">and</span>
            <Link href="/terms" className="font-medium text-accent underline">
              Terms of Use
            </Link>
          </div>
          <Link
            href="/about#feedback"
            className="flex min-h-[44px] items-center border-b border-border py-2 text-[15px] font-medium text-accent underline"
          >
            Send feedback
          </Link>
          <p className="py-3 text-[14px] text-text-secondary">Version 0.1.0</p>
        </Section>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete everything?"
          body="This permanently deletes all reviewers, questions, uploaded files, and quiz history on this device. This can't be undone."
          confirmLabel="Delete all"
          destructive
          onConfirm={() => void deleteAll()}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
