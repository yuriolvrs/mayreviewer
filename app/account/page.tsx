"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import BackLink from "@/app/components/BackLink";
import PasswordInput from "@/app/components/PasswordInput";
import { useAuth, useDisplayNamePrompt } from "@/app/components/AuthProvider";
import DisplayNameForm from "@/app/components/DisplayNameForm";
import { getSupabaseClient } from "@/app/lib/supabase";
import { getSyncMeta, syncNow, wipeAccountData } from "@/app/lib/sync";
import { addCountLabel, listMyShares, unshare } from "@/app/lib/shares";
import type { GalleryRow } from "@/app/lib/shares";

// Label left, control right in a fixed 200px gutter — same shape as the
// Settings rows so actions align across pages. Stacks on narrow screens.
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
        <div className="text-[0.9375rem] font-medium text-text-primary">{label}</div>
        {hint && (
          <div role="status" className="mt-px text-[0.8125rem] text-text-secondary">
            {hint}
          </div>
        )}
      </div>
      <div className="flex w-[200px] flex-none items-center justify-end max-sm:w-full max-sm:justify-start">
        {children}
      </div>
    </div>
  );
}

function formatSyncTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString();
}

function SharesSection() {
  const [shares, setShares] = useState<GalleryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<GalleryRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listMyShares().then((result) => {
      if (cancelled) return;
      if (result.ok) setShares(result.shares);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function confirmUnshare() {
    if (!pending) return;
    const target = pending;
    setPending(null);
    setActionError(null);
    const result = await unshare(target.code);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setShares((prev) => (prev ? prev.filter((s) => s.code !== target.code) : prev));
  }

  return (
    <div id="shares" className="scroll-mt-4 border-b border-border py-3">
      <div className="text-[0.9375rem] font-medium text-text-primary">Your shares</div>
      <p className="mt-px text-[0.8125rem] text-text-secondary">
        Shares hold questions only. Unsharing removes the share for everyone.
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-[0.875rem] font-medium text-error">
          {error}
        </p>
      ) : shares === null ? (
        <p role="status" className="mt-2 text-[0.875rem] text-text-secondary">
          Loading your shares…
        </p>
      ) : shares.length === 0 ? (
        <p className="mt-2 text-[0.875rem] text-text-secondary">You haven&apos;t shared anything yet.</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {shares.map((s) => (
            <li
              key={s.code}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="break-words text-[0.9375rem] font-medium text-text-primary">{s.title}</div>
                <div className="mt-px text-[0.8125rem] text-text-secondary">
                  <span className="font-mono">{s.code}</span>
                  {" · "}
                  {s.kind === "format" ? "Format" : "Reviewer"}
                  {" · "}
                  {s.listed ? "Listed" : "Unlisted"}
                  {" · "}
                  Updated {new Date(s.updatedAt).toLocaleDateString()}
                  {" · "}
                  {addCountLabel(s.addCount ?? 0)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href={`/s/${s.code}`}
                  className="flex min-h-[44px] items-center text-[0.9375rem] font-medium text-accent underline"
                >
                  Open
                </Link>
                <button
                  onClick={() => setPending(s)}
                  className="min-h-[44px] rounded-lg border border-error px-4 py-2 text-[0.9375rem] font-medium text-error"
                >
                  Unshare
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {actionError && (
        <p role="alert" className="mt-2 text-[0.875rem] font-medium text-error">
          {actionError}
        </p>
      )}
      {pending && (
        <ConfirmDialog
          title="Stop sharing?"
          body={`The link and code ${pending.code} will stop working for everyone. Your own copy is not affected.`}
          confirmLabel="Unshare"
          destructive
          onConfirm={() => void confirmUnshare()}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const { user, configured, signOut } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [confirmingAccountDelete, setConfirmingAccountDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { profile, refreshProfile } = useDisplayNamePrompt();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [changingPw, setChangingPw] = useState(false);

  // localStorage is a browser-only external store; one-off read on mount is intentional.
  useEffect(() => {
    const meta = getSyncMeta();
    if (meta.lastSyncedAt) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSyncStatus(`Last synced ${formatSyncTime(meta.lastSyncedAt)}.`);
    } else if (meta.lastError) {
      setSyncStatus(meta.lastError);
    }
  }, []);

  async function syncNowManual() {
    if (!user) return;
    setSyncing(true);
    const result = await syncNow(user.id);
    setSyncing(false);
    if (result.ok) {
      const meta = getSyncMeta();
      setSyncStatus(
        meta.lastSyncedAt ? `Last synced ${formatSyncTime(meta.lastSyncedAt)}.` : "Sync finished.",
      );
    } else {
      setSyncStatus(result.error ?? "Sync failed.");
    }
  }

  async function deleteAccount() {
    if (!user) return;
    setConfirmingAccountDelete(false);
    const result = await wipeAccountData(user.id);
    if (!result.ok) {
      setNotice(result.error ?? "Delete failed. Nothing was removed.");
      return;
    }
    await signOut();
    router.replace("/goodbye");
  }

  async function signOutKept() {
    // Logout empties the device after flushing to the cloud — except offline,
    // when the rows stay to avoid data loss. Say so, or the kept reviewers
    // look like a failed logout.
    const { flushed } = await signOut();
    if (!flushed) {
      setNotice("Signed out, but you're offline. Your reviewers stay on this device until the next sync.");
    }
  }

  async function changePassword() {
    if (newPassword.length < 6) {
      setPwError("Use at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("Passwords don't match.");
      return;
    }
    const client = getSupabaseClient();
    if (!client) return;
    setPwError(null);
    setChangingPw(true);
    const { error } = await client.auth.updateUser({ password: newPassword });
    setChangingPw(false);
    if (error) {
      setPwError(error.message.slice(0, 200));
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    setNotice("Password updated.");
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <BackLink href="/">Home</BackLink>
      <h1 className="text-[1.625rem] font-semibold text-text-primary">Account</h1>

      {notice && <p role="status" className="mt-4 rounded-lg bg-surface-alt px-3 py-2 text-[0.875rem] text-text-secondary">{notice}</p>}

      <div className="mt-2 border-t border-border">
        {!user ? (
          configured ? (
            <Link
              href="/login"
              className="flex min-h-[44px] items-center border-b border-border py-2 text-[0.9375rem] font-medium text-accent underline"
            >
              Sign in to sync
            </Link>
          ) : (
            <p className="border-b border-border py-3 text-[0.9375rem] text-text-secondary">
              Sync isn&apos;t set up on this build yet. Everything stays on this device.
            </p>
          )
        ) : (
          <>
            <Row label="Signed in as">
              <p className="break-all text-[0.9375rem] text-text-primary">{user.email}</p>
            </Row>
            <div className="border-b border-border py-3">
              <div className="text-[0.9375rem] font-medium text-text-primary">Display name</div>
              <p className="mt-px text-[0.8125rem] text-text-secondary">
                This is how you appear on shares when you choose to show your name.
              </p>
              <div className="mt-2 max-w-sm">
                <DisplayNameForm
                  key={profile ? `${profile.displayName}#${profile.tag}` : "none"}
                  initial={profile}
                  onSaved={() => void refreshProfile()}
                />
              </div>
            </div>
            {configured && <SharesSection />}
            <Row
              label="Sync"
              hint={syncStatus ?? "Your data syncs across devices; uploaded files stay on each device."}
            >
              <button
                onClick={() => void syncNowManual()}
                disabled={syncing}
                className="min-h-[44px] rounded-lg border border-border-strong px-4 py-2 text-[0.9375rem] font-medium text-text-primary disabled:opacity-40"
              >
                {syncing ? "Syncing…" : "Sync now"}
              </button>
            </Row>
            <div className="border-b border-border py-3">
              <div className="text-[0.9375rem] font-medium text-text-primary">Change password</div>
              <p className="mt-px text-[0.8125rem] text-text-secondary">At least 6 characters.</p>
              <div className="mt-2 grid max-w-sm gap-2">
                <PasswordInput
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={setNewPassword}
                  shown={showNewPassword}
                  onToggleShown={() => setShowNewPassword((v) => !v)}
                  toggleNoun="new password"
                  placeholder="New password"
                  ariaLabel="New password"
                />
                <PasswordInput
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  shown={showConfirmPassword}
                  onToggleShown={() => setShowConfirmPassword((v) => !v)}
                  toggleNoun="confirm new password"
                  placeholder="Confirm new password"
                  ariaLabel="Confirm new password"
                />
                {pwError && (
                  <p role="alert" className="text-[0.875rem] font-medium text-error">
                    {pwError}
                  </p>
                )}
                <div>
                  <button
                    onClick={() => void changePassword()}
                    disabled={changingPw}
                    className="min-h-[44px] rounded-lg border border-border-strong px-4 py-2 text-[0.9375rem] font-medium text-text-primary disabled:opacity-40"
                  >
                    {changingPw ? "Updating…" : "Update password"}
                  </button>
                </div>
              </div>
            </div>
            <Row label="Log out" hint="Clears this device; signing back in restores your data.">
              <button
                onClick={() => void signOutKept()}
                className="min-h-[44px] rounded-lg border border-border-strong px-4 py-2 text-[0.9375rem] font-medium text-text-primary"
              >
                Log out
              </button>
            </Row>
            <Row label="Delete account" hint="Wipes your data from the cloud and this device. Can't be undone.">
              <button
                onClick={() => setConfirmingAccountDelete(true)}
                className="min-h-[44px] rounded-lg border border-error px-4 py-2 text-[0.9375rem] font-medium text-error"
              >
                Delete account
              </button>
            </Row>
          </>
        )}
      </div>

      {confirmingAccountDelete && (
        <ConfirmDialog
          title="Delete your account data?"
          body="This permanently deletes your synced reviewers, questions, history, formats, and settings from the cloud and this device. Signing in again starts a fresh empty account. This can't be undone."
          confirmLabel="Delete account data"
          destructive
          onConfirm={() => void deleteAccount()}
          onCancel={() => setConfirmingAccountDelete(false)}
        />
      )}
    </div>
  );
}
