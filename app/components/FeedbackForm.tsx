"use client";

import { useState } from "react";
import {
  FEEDBACK_TYPES,
  SUPPORT_EMAIL,
  buildFeedbackMailto,
  isFeedbackMessageValid,
  type FeedbackType,
} from "@/app/lib/feedback";

// No backend: submit hands a prefilled email to the user's own mail app.
export default function FeedbackForm() {
  const [type, setType] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFeedbackMessageValid(message)) {
      setError("Write a little more — at least 10 characters so it's actionable.");
      return;
    }
    setError(null);
    window.location.href = buildFeedbackMailto(type, message);
    setSent(true);
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-[15px] font-medium text-text-primary">What is this about?</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as FeedbackType)}
          className="min-h-[44px] w-full max-w-xs rounded-lg border border-border bg-surface px-2 py-2 text-[15px] text-text-primary"
        >
          {FEEDBACK_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[15px] font-medium text-text-primary">Message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="What happened, and what did you expect?"
          aria-describedby={error ? "feedback-error" : undefined}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[15px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent"
        />
      </label>
      {error && (
        <p id="feedback-error" role="alert" className="text-[14px] text-error">
          {error}
        </p>
      )}
      <div className="flex justify-center">
        <button
          type="submit"
          className="min-h-[44px] rounded-lg bg-accent px-4 py-2 text-[15px] font-medium text-on-accent hover:bg-accent-hover"
        >
          Send via mail app
        </button>
      </div>
      {sent && (
        <p role="status" className="text-[14px] text-text-secondary">
          Mail app opened. If nothing happened, email {SUPPORT_EMAIL} directly.
        </p>
      )}
    </form>
  );
}
