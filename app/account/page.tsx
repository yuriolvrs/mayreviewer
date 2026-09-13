"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { useAuth } from "@/app/components/AuthProvider";
import { getSupabaseClient } from "@/app/lib/supabase";
import { getSyncMeta, syncNow, wipeAccountData } from "@/app/lib/sync";

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
        <div className="text-[15px] font-medium text-text-primary">{label}</div>
        {hint && (
          <div role="status" className="mt-px text-[13px] text-text-secondary">
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

export default function AccountPage() {
  const router = useRouter();
  const { user, configured, signOut } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [confirmingAccountDelete, setConfirmingAccountDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

  // The session arrives after mount; refresh the field when the user changes.
  useEffect(() => {
    const name = user?.user_metadata?.display_name;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplayName(typeof name === "string" ? name : "");
  }, [user]);

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
      setNotice(result.error ?? "Delete failed — nothing was removed.");
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
      setNotice("Signed out, but you're offline — your reviewers stay on this device until the next sync.");
    }
  }

  const savedName =
    typeof user?.user_metadata?.display_name === "string" ? user.user_metadata.display_name : "";

  async function saveDisplayName() {
    const client = getSupabaseClient();
    if (!client || !user) return;
    setSavingName(true);
    const { error } = await client.auth.updateUser({ data: { display_name: displayName.trim() } });
    setSavingName(false);
    setNotice(error ? error.message.slice(0, 200) : "Display name saved.");
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
      <h1 className="text-[26px] font-semibold text-text-primary">Account</h1>

      {notice && <p role="status" className="mt-4 rounded-lg bg-surface-alt px-3 py-2 text-[14px] text-text-secondary">{notice}</p>}

      <div className="mt-2 border-t border-border">
        {!user ? (
          configured ? (
            <Link
              href="/login"
              className="flex min-h-[44px] items-center border-b border-border py-2 text-[15px] font-medium text-accent underline"
            >
              Sign in to sync
            </Link>
          ) : (
            <p className="border-b border-border py-3 text-[15px] text-text-secondary">
              Sync isn&apos;t set up on this build yet — everything stays on this device.
            </p>
          )
        ) : (
          <>
            <Row label="Signed in as">
              <p className="break-all text-[15px] text-text-primary">{user.email}</p>
            </Row>
            <div className="border-b border-border py-3">
              <label htmlFor="display-name" className="text-[15px] font-medium text-text-primary">
                Display name
              </label>
              <p className="mt-px text-[13px] text-text-secondary">Shown on your account on every device.</p>
              <div className="mt-2 flex gap-2">
                <input
                  id="display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={60}
                  autoComplete="nickname"
                  className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-2 text-[15px] text-text-primary outline-none focus:border-accent"
                />
                <button
                  onClick={() => void saveDisplayName()}
                  disabled={savingName || displayName.trim() === savedName}
                  className="min-h-[44px] flex-none rounded-lg border border-border-strong px-4 py-2 text-[15px] font-medium text-text-primary disabled:opacity-40"
                >
                  {savingName ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
            <Row
              label="Sync"
              hint={syncStatus ?? "Your data syncs across devices; uploaded files stay on each device."}
            >
              <button
                onClick={() => void syncNowManual()}
                disabled={syncing}
                className="min-h-[44px] rounded-lg border border-border-strong px-4 py-2 text-[15px] font-medium text-text-primary disabled:opacity-40"
              >
                {syncing ? "Syncing…" : "Sync now"}
              </button>
            </Row>
            <div className="border-b border-border py-3">
              <div className="text-[15px] font-medium text-text-primary">Change password</div>
              <p className="mt-px text-[13px] text-text-secondary">At least 6 characters.</p>
              <div className="mt-2 grid max-w-sm gap-2">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                  aria-label="New password"
                  autoComplete="new-password"
                  className="h-11 w-full rounded-lg border border-border bg-surface px-2 py-2 text-[15px] text-text-primary outline-none focus:border-accent"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  aria-label="Confirm new password"
                  autoComplete="new-password"
                  className="h-11 w-full rounded-lg border border-border bg-surface px-2 py-2 text-[15px] text-text-primary outline-none focus:border-accent"
                />
                {pwError && (
                  <p role="alert" className="text-[14px] font-medium text-error">
                    {pwError}
                  </p>
                )}
                <div>
                  <button
                    onClick={() => void changePassword()}
                    disabled={changingPw}
                    className="min-h-[44px] rounded-lg border border-border-strong px-4 py-2 text-[15px] font-medium text-text-primary disabled:opacity-40"
                  >
                    {changingPw ? "Updating…" : "Update password"}
                  </button>
                </div>
              </div>
            </div>
            <Row label="Log out" hint="Clears this device; signing back in restores your data.">
              <button
                onClick={() => void signOutKept()}
                className="min-h-[44px] rounded-lg border border-border-strong px-4 py-2 text-[15px] font-medium text-text-primary"
              >
                Log out
              </button>
            </Row>
            <Row label="Delete account" hint="Wipes your data from the cloud and this device. Can't be undone.">
              <button
                onClick={() => setConfirmingAccountDelete(true)}
                className="min-h-[44px] rounded-lg border border-error px-4 py-2 text-[15px] font-medium text-error"
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
