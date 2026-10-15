"use client";

import { useEffect, useRef, useState } from "react";
import PasswordInput from "@/app/components/PasswordInput";
import { getSupabaseClient } from "@/app/lib/supabase";
import {
  parseSupabaseWait,
  readResetSends,
  recordResetSend,
  resetCapReached,
  resetLinkWait,
  validateNewPassword,
} from "@/app/lib/password";

// The hidden email field is read-only, so keep it out of the focus trap.
const FOCUSABLE = "button:not([disabled]), input:not([disabled]):not([readonly])";

type Step = "current" | "link";

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label className="mt-4 block text-[0.9375rem] font-medium text-text-primary" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

// 42 -> "0:42"
// m:ss reads well for short waits; the hourly cap can be close to an hour,
// so long waits show whole minutes.
function formatWait(seconds: number): string {
  if (seconds >= 120) return `${Math.ceil(seconds / 60)} min`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const linkButton = "mt-1 min-h-[44px] text-left text-[0.875rem] font-medium text-accent underline";

// Modal to change or set a password. Two ways to prove it is you: the current
// password, or a reset link sent by email (the link finishes on /auth/reset).
export default function PasswordDialog({
  email,
  mode,
  onDone,
  onClose,
}: {
  email: string;
  mode: "change" | "set";
  onDone: (message: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>(mode === "change" ? "current" : "link");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  // Seconds until another link may be sent. The limit here is for UX only.
  const [wait, setWait] = useState(() => resetLinkWait(readResetSends(email), Date.now()));
  const [capBlocked, setCapBlocked] = useState(() => resetCapReached(readResetSends(email), Date.now()));
  // Wrong current password shows under that field, not in the bottom slot.
  const [currentError, setCurrentError] = useState<string | null>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(timer);
  }, [wait > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus the first field (or button) on open and whenever the step changes.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [step]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const edge = e.shiftKey ? items[0] : items[items.length - 1];
    if (document.activeElement === edge) {
      e.preventDefault();
      (e.shiftKey ? items[items.length - 1] : items[0]).focus();
    }
  }

  function switchStep(to: Step) {
    setError(null);
    setCurrentError(null);
    setStep(to);
  }

  async function sendLink() {
    const client = getSupabaseClient();
    if (!client) {
      setError("Sync isn't set up on this build.");
      return;
    }
    const sends = readResetSends(email);
    const blocked = resetLinkWait(sends, Date.now());
    if (blocked > 0) {
      setWait(blocked);
      setCapBlocked(resetCapReached(sends, Date.now()));
      return;
    }
    setError(null);
    setSending(true);
    const { error: sendError } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset`,
    });
    setSending(false);
    if (sendError) {
      const seconds = parseSupabaseWait(sendError.message);
      if (seconds !== null) {
        setWait(seconds);
        setError("Too many requests. You can send another link in a moment.");
      } else if (/rate limit/i.test(sendError.message)) {
        setWait(60);
        setError("Too many reset emails. Try again in an hour.");
      } else {
        setError(sendError.message.slice(0, 200));
      }
      return;
    }
    const now = Date.now();
    recordResetSend(email, now);
    const sends2 = readResetSends(email, now);
    setWait(resetLinkWait(sends2, now));
    setCapBlocked(resetCapReached(sends2, now));
    setLinkSent(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step !== "current") return;
    const invalid = validateNewPassword(next, confirm);
    if (invalid) {
      setError(invalid);
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      setError("Sync isn't set up on this build.");
      return;
    }
    setError(null);
    setCurrentError(null);
    setBusy(true);
    // This fires SIGNED_IN for the same user, so AuthProvider runs a same-user sync. That is fine.
    const { error: signInError } = await client.auth.signInWithPassword({ email, password: current });
    if (signInError) {
      setBusy(false);
      if (/rate/i.test(signInError.message)) setError(signInError.message.slice(0, 200));
      else setCurrentError("Incorrect password. Try again, or reset it by email.");
      return;
    }
    const { error: updateError } = await client.auth.updateUser({
      password: next,
      current_password: current,
      data: { password_set: true },
    });
    setBusy(false);
    if (updateError) {
      setError(updateError.message.slice(0, 200));
      return;
    }
    onDone("Password updated.");
  }

  const title = mode === "change" ? "Change password" : "Set a password";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-dialog-title"
      ref={ref}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    >
      <form
        onSubmit={(e) => void submit(e)}
        className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-lg border border-border bg-surface p-6 shadow-menu"
      >
        <h2 id="password-dialog-title" className="text-[1.1875rem] font-semibold text-text-primary">
          {title}
        </h2>
        {/* Lets password managers file the new password under the right account. */}
        <input
          type="email"
          autoComplete="username"
          value={email}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
        />

        {step === "current" ? (
          <>
            <Label htmlFor="pw-current">Current password</Label>
            <PasswordInput
              id="pw-current"
              autoComplete="current-password"
              value={current}
              onChange={(v) => {
                setCurrent(v);
                setCurrentError(null);
              }}
              shown={showCurrent}
              onToggleShown={() => setShowCurrent((v) => !v)}
              toggleNoun="current password"
              invalid={currentError !== null}
              describedBy={currentError ? "pw-current-error" : undefined}
            />
            {currentError && (
              <p id="pw-current-error" role="alert" className="mt-1 text-[0.875rem] font-medium text-error">
                {currentError}
              </p>
            )}
            <button type="button" onClick={() => switchStep("link")} className={linkButton}>
              Forgot it? Reset it by email
            </button>
            <Label htmlFor="pw-new">New password</Label>
            <PasswordInput
              id="pw-new"
              autoComplete="new-password"
              value={next}
              onChange={setNext}
              shown={showNext}
              onToggleShown={() => setShowNext((v) => !v)}
              toggleNoun="new password"
            />
            <Label htmlFor="pw-confirm">Confirm new password</Label>
            <PasswordInput
              id="pw-confirm"
              autoComplete="new-password"
              value={confirm}
              onChange={setConfirm}
              shown={showConfirm}
              onToggleShown={() => setShowConfirm((v) => !v)}
              toggleNoun="confirm new password"
            />
          </>
        ) : (
          <>
            <p className="mt-2 text-[0.9375rem] text-text-secondary">
              We&apos;ll email a link to {email}. Open it to set a new password. The link works once and expires
              soon.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-3">
              <button
                type="button"
                onClick={() => void sendLink()}
                disabled={sending || wait > 0}
                className="min-h-[44px] rounded-lg bg-accent px-4 py-2 text-[0.9375rem] font-medium tabular-nums text-on-accent hover:bg-accent-hover disabled:opacity-40"
              >
                {sending
                  ? "Sending…"
                  : wait > 0
                    ? `Resend in ${formatWait(wait)}`
                    : linkSent
                      ? "Resend link"
                      : "Send link"}
              </button>
              {linkSent && (
                <span role="status" className="text-[0.875rem] text-text-secondary">
                  Link sent. Check your inbox, including spam.
                </span>
              )}
            </div>
            {capBlocked && wait > 0 && (
              <p className="mt-2 text-[0.875rem] text-text-secondary">
                You&apos;ve sent 3 links in the last hour. Check your inbox and spam folder first.
              </p>
            )}
            {mode === "change" && (
              <button type="button" onClick={() => switchStep("current")} className={linkButton}>
                Use current password instead
              </button>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="mt-3 text-[0.875rem] font-medium text-error">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-lg px-4 py-2 text-[0.9375rem] font-medium text-text-secondary hover:bg-surface-alt"
          >
            {step === "link" && linkSent ? "Close" : "Cancel"}
          </button>
          {step === "current" && (
            <button
              type="submit"
              disabled={busy}
              className="min-h-[44px] rounded-lg bg-accent px-4 py-2 text-[0.9375rem] font-medium text-on-accent hover:bg-accent-hover disabled:opacity-40"
            >
              {busy ? "Updating…" : "Update password"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
