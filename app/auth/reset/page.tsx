"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import PasswordInput from "@/app/components/PasswordInput";
import { getSupabaseClient } from "@/app/lib/supabase";
import { validateNewPassword } from "@/app/lib/password";

// Landing page for the password reset email. Like /auth/callback, the link
// can carry `?code=...` (exchanged below) or tokens in the URL hash (consumed
// by getSession). Either way it gives a recovery session, and the server
// skips the current-password check for that, so we only ask for a new one.
//
// State starts as "checking" and error as null (never derived during render)
// so the server and client first render agree.
function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label className="mt-4 block text-[0.9375rem] font-medium text-text-primary" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

// Same rule as the Supabase server's IsRecovery(): an `amr` entry of otp,
// magiclink or recovery. The default (implicit) reset link records "otp".
// Password and Google sign-ins record "password" and "oauth", so they fail.
// That `amr` entry stays on the session for its whole life, so it must also
// be recent. Otherwise anyone on a device that once used a reset link could
// open this page later and set a password with no check.
const RECOVERY_METHODS = ["otp", "magiclink", "recovery"];
const RECOVERY_WINDOW_SECONDS = 10 * 60;

function isRecoverySession(accessToken: string): boolean {
  try {
    const payload = accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(payload)) as { amr?: { method?: string; timestamp?: number }[] };
    const now = Date.now() / 1000;
    return (
      claims.amr?.some(
        (a) =>
          RECOVERY_METHODS.includes(a.method ?? "") &&
          typeof a.timestamp === "number" &&
          now - a.timestamp < RECOVERY_WINDOW_SECONDS,
      ) ?? false
    );
  } catch {
    return false;
  }
}

function ResetInner() {
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const invalid = "This link is invalid or has expired. Request a new one from your Account page.";
    void (async () => {
      const client = getSupabaseClient();
      if (!client) {
        if (!cancelled) {
          setLinkError("Sync isn't set up on this build.");
          setChecking(false);
        }
        return;
      }
      const params = new URLSearchParams(window.location.search);
      if (params.get("error_description") ?? params.get("error")) {
        if (!cancelled) {
          setLinkError(invalid);
          setChecking(false);
        }
        return;
      }
      const code = params.get("code");
      if (code) {
        const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (exchangeError) {
          setLinkError(invalid);
          setChecking(false);
          return;
        }
      }
      // getSession() also consumes implicit-flow hash tokens if present.
      const { data } = await client.auth.getSession();
      if (cancelled) return;
      // Only a session from the reset link may set a password here. A normal
      // session must use the Account dialog, which asks for the current one.
      if (data.session && isRecoverySession(data.session.access_token)) {
        setEmail(data.session.user.email ?? "");
      } else setLinkError(invalid);
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
    setBusy(true);
    const { error: updateError } = await client.auth.updateUser({
      password: next,
      data: { password_set: true },
    });
    setBusy(false);
    if (updateError) {
      setError(updateError.message.slice(0, 200));
      return;
    }
    setSaved(true);
  }

  const accountLink = (
    <Link
      href="/account"
      className="mt-3 flex min-h-[44px] items-center text-[0.9375rem] font-medium text-accent underline"
    >
      Go to Account
    </Link>
  );

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-6 py-10">
      {checking ? (
        <p role="status" className="text-[0.9375rem] text-text-secondary">
          Checking your link…
        </p>
      ) : linkError ? (
        <>
          <p role="alert" className="rounded-lg bg-surface-alt px-3 py-2 text-[0.875rem] font-medium text-error">
            {linkError}
          </p>
          {accountLink}
        </>
      ) : saved ? (
        <>
          <p role="status" className="rounded-lg bg-surface-alt px-3 py-2 text-[0.875rem] text-text-secondary">
            Password saved. You can now sign in with your email and this password.
          </p>
          {accountLink}
        </>
      ) : (
        <form onSubmit={(e) => void submit(e)}>
          <h1 className="text-[1.625rem] font-semibold text-text-primary">Set a new password</h1>
          {/* Lets password managers file the new password under the right account. */}
          <input
            type="email"
            autoComplete="username"
            value={email ?? ""}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
          />
          <Label htmlFor="reset-new">New password</Label>
          <PasswordInput
            id="reset-new"
            autoComplete="new-password"
            value={next}
            onChange={setNext}
            shown={showNext}
            onToggleShown={() => setShowNext((v) => !v)}
            toggleNoun="new password"
          />
          <Label htmlFor="reset-confirm">Confirm new password</Label>
          <PasswordInput
            id="reset-confirm"
            autoComplete="new-password"
            value={confirm}
            onChange={setConfirm}
            shown={showConfirm}
            onToggleShown={() => setShowConfirm((v) => !v)}
            toggleNoun="confirm new password"
          />
          {error && (
            <p role="alert" className="mt-3 text-[0.875rem] font-medium text-error">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="mt-5 min-h-[48px] w-full rounded-lg bg-accent px-4 py-2 text-[0.9375rem] font-semibold text-on-accent disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save password"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function AuthResetPage() {
  return (
    <Suspense>
      <ResetInner />
    </Suspense>
  );
}
