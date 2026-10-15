"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { SUPPORT_EMAIL } from "@/app/lib/feedback";

// Support address with an icon-only copy button, same pattern as the share code.
export default function CopyEmail({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the address is still a mailto link.
    }
  }

  return (
    <div
      className={`flex w-full max-w-md items-center justify-between gap-2 rounded-lg border border-border bg-surface-alt py-1 pl-4 pr-1 ${className}`}
    >
      <div className="min-w-0">
        <p className="text-[0.75rem] font-medium text-text-tertiary">Email</p>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="block break-all text-[0.9375rem] font-medium text-text-primary underline-offset-2 hover:underline"
        >
          {SUPPORT_EMAIL}
        </a>
      </div>
      <span className="relative inline-flex shrink-0">
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy email address"
          title="Copy email address"
          className="inline-flex size-11 items-center justify-center rounded-lg text-text-secondary hover:bg-surface hover:text-text-primary"
        >
          {copied ? (
            <Check size={18} aria-hidden="true" className="text-accent" />
          ) : (
            <Copy size={18} aria-hidden="true" />
          )}
        </button>
        {copied && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-5 right-0 whitespace-nowrap rounded bg-text-primary px-2 py-0.5 text-[0.75rem] font-medium text-surface"
          >
            Copied
          </span>
        )}
        <span role="status" className="sr-only">
          {copied ? "Email address copied" : ""}
        </span>
      </span>
    </div>
  );
}
