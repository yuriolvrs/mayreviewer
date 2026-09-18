"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import PasswordInput from "@/app/components/PasswordInput";

// Labelled password row: label above, shared input + eye toggle below.
function PasswordField({
  id,
  label,
  autoComplete,
  value,
  onChange,
  shown,
  onToggleShown,
}: {
  id: string;
  label: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  shown: boolean;
  onToggleShown: () => void;
}) {
  return (
    <>
      <label className="mt-4 block text-[15px] font-medium text-text-primary" htmlFor={id}>
        {label}
      </label>
      <PasswordInput
        id={id}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        shown={shown}
        onToggleShown={onToggleShown}
        toggleNoun={label.toLowerCase()}
        required
        minLength={6}
        className="relative mt-1"
      />
    </>
  );
}

// The official Google "G" — required by Google's sign-in branding policy,
// which mandates the logo on every Google sign-in button. Colors are the
// brand originals and must not be altered.
function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.44 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.29a12 12 0 0 0 0 10.76l3.98-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.62l3.98 3.1c.95-2.85 3.6-4.95 6.73-4.95z"
      />
    </svg>
  );
}

// Email + Google sign-in. Reviewers stay usable logged out (local-only), so
// this page sells sync, not access: signing in merges this device's data to
// the cloud and pulls the other devices' down.
export default function LoginPage() {
  const router = useRouter();
  const { configured, user, loading, signUpWithEmail, signInWithEmail, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNeedsConfirmation(false);
    // Checked here rather than via the form so the message lands in the
    // same error slot as server failures. No recovery flow exists yet, so a
    // typo at signup would lock the account.
    if (mode === "signup" && password !== confirmPassword) {
      setBusy(false);
      setError("Passwords don't match. Re-type them to continue.");
      return;
    }
    const result =
      mode === "signup"
        ? await signUpWithEmail(email.trim(), password)
        : await signInWithEmail(email.trim(), password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    if (result.needsConfirmation) {
      setNeedsConfirmation(true);
      return;
    }
    // Fresh signups land with a flag so home can confirm the account was
    // created — otherwise the redirect is silent and users doubt it worked.
    router.replace(mode === "signup" ? "/?welcome=1" : "/");
  }

  async function submitGoogle() {
    setBusy(true);
    setError(null);
    const result = await signInWithGoogle();
    // Success leaves the page via provider redirect; only failures land here.
    if (!result.ok) {
      setBusy(false);
      setError(result.error ?? "Google sign-in failed.");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-md flex-1 px-6 py-10">
        <p className="text-[15px] text-text-secondary">Checking your session…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-6 py-10">
      <h1 className="text-[26px] font-semibold text-text-primary">Sync your reviewers</h1>
      <p className="mt-1 text-[15px] text-text-secondary">
        Sign in to back up reviewers, questions, history, and settings — and pick them up on
        another device. Your uploaded files stay on each device.
      </p>

      {!configured && (
        <p role="alert" className="mt-4 rounded-lg bg-surface-alt px-3 py-2 text-[14px] text-text-secondary">
          Sync isn&apos;t set up on this build yet — the app still works fully on this device.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-surface-alt px-3 py-2 text-[14px] font-medium text-error">
          {error}
        </p>
      )}
      {needsConfirmation && (
        <p role="status" className="mt-4 rounded-lg bg-surface-alt px-3 py-2 text-[14px] text-text-secondary">
          Account created — check your inbox for the confirmation link, then sign in.
        </p>
      )}

      <div className="mt-6">
        <button
          onClick={() => void submitGoogle()}
          disabled={busy || !configured}
          className="flex min-h-[48px] w-full items-center justify-center gap-3 rounded-lg border border-border-strong px-4 py-2 text-[15px] font-medium text-text-primary disabled:opacity-40"
        >
          <GoogleLogo />
          Continue with Google
        </button>

        <div className="my-5 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[13px] text-text-tertiary">or with email</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <div role="group" aria-label="Sign in or create account" className="flex gap-[3px] rounded-[10px] border border-border-strong bg-surface p-1.5">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setError(null);
                setNeedsConfirmation(false);
                setConfirmPassword("");
              }}
              aria-pressed={mode === m}
              className={`flex min-h-8 flex-1 items-center justify-center rounded-md px-2 py-1.5 text-[15px] ${
                mode === m
                  ? "bg-accent font-semibold text-on-accent"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <form onSubmit={(e) => void submitEmail(e)} className="mt-4">
          <label className="block text-[15px] font-medium text-text-primary" htmlFor="login-email">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 h-12 w-full rounded-lg border border-border bg-surface px-3 py-2 text-[15px] text-text-primary outline-none focus:border-accent"
          />
          <PasswordField
            id="login-password"
            label="Password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={setPassword}
            shown={showPassword}
            onToggleShown={() => setShowPassword((v) => !v)}
          />
          {mode === "signup" && (
            <PasswordField
              id="login-confirm"
              label="Confirm password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              shown={showConfirm}
              onToggleShown={() => setShowConfirm((v) => !v)}
            />
          )}
          <button
            type="submit"
            disabled={busy || !configured}
            className="mt-5 min-h-[48px] w-full rounded-lg bg-accent px-4 py-2 text-[15px] font-semibold text-on-accent disabled:opacity-40"
          >
            {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
