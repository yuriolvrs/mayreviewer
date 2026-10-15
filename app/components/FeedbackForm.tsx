"use client";

import CopyEmail from "@/app/components/CopyEmail";
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
      setError("Please write at least 10 characters so we can act on it.");
      return;
    }
    setError(null);
    window.location.href = buildFeedbackMailto(type, message);
    setSent(true);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <CopyEmail className="mt-4" />
      <label className="flex flex-col gap-1.5">
        <span className="text-[0.9375rem] font-medium text-text-primary">What is this about?</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as FeedbackType)}
          className="min-h-[44px] w-full max-w-xs rounded-lg border border-border bg-surface px-2 py-2 text-[0.9375rem] text-text-primary"
        >
          {FEEDBACK_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[0.9375rem] font-medium text-text-primary">Message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="What happened, and what did you expect?"
          aria-describedby={error ? "feedback-error" : undefined}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[0.9375rem] text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent"
        />
        <span className="text-[0.8125rem] text-text-tertiary">
          {message.length} / 2000. Do not include passwords or private information.
        </span>
      </label>
      {error && (
        <p id="feedback-error" role="alert" className="text-[0.875rem] text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          className="min-h-[44px] rounded-lg bg-accent px-4 py-2 text-[0.9375rem] font-medium text-on-accent hover:bg-accent-hover"
        >
          Send via mail app
        </button>
      </div>
      {sent && (
        <p role="status" className="text-[0.875rem] text-text-secondary">
          Your mail app should open with the message ready to send. If it does not, email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-accent underline">
            {SUPPORT_EMAIL}
          </a>{" "}
          directly.
        </p>
      )}
    </form>
  );
}
