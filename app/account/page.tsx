"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import BackLink from "@/app/components/BackLink";
import PasswordDialog from "@/app/components/PasswordDialog";
import { useAuth, useDisplayNamePrompt } from "@/app/components/AuthProvider";
import DisplayNameForm from "@/app/components/DisplayNameForm";
import { hasPassword, hasProvider } from "@/app/lib/password";
import { formatHandle } from "@/app/lib/profile";
import { getSyncMeta, syncNow, wipeAccountData } from "@/app/lib/sync";
import { addCountLabel, listMyShares, unshare } from "@/app/lib/shares";
import type { GalleryRow } from "@/app/lib/shares";

const secondaryButton =
  "min-h-[44px] rounded-lg border border-border-strong bg-surface px-4 py-2 text-[0.9375rem] font-medium text-text-primary hover:bg-surface-alt disabled:opacity-40";
const dangerButton =
  "min-h-[44px] rounded-lg border border-error px-3 py-1 text-[0.9375rem] font-medium text-error hover:bg-error-subtle";

// Titled group of rows, same shape as the Settings sections. The heading uses
// the Label style so it outranks the row labels below it.
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
      <h2 className="text-[0.8125rem] font-semibold uppercase tracking-[0.025em] text-text-secondary">
        {title}
      </h2>
      {note && <p className="mt-0.5 text-[0.8125rem] text-text-secondary">{note}</p>}
      <div className="mt-2 border-t border-border">{children}</div>
    </section>
  );
}

// Label left, control right at its natural width. Wraps on narrow screens.
// `below` holds content that needs the full row width (an inline form).
function Row({
  label,
  hint,
  below,
  children,
}: {
  label: string;
  hint?: string;
  below?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border py-3">
      <div className="flex min-h-[44px] flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="text-[0.9375rem] font-medium text-text-primary">{label}</div>
          {hint && <div className="mt-px break-words text-[0.8125rem] text-text-secondary">{hint}</div>}
        </div>
        {children && <div className="flex flex-none items-center">{children}</div>}
      </div>
      {below}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
    <Section title="Shares" note="Shares hold questions only. Unsharing removes the share for everyone.">
      <div id="shares" className="scroll-mt-4">
        {error ? (
          <p role="alert" className="border-b border-border py-3 text-[0.875rem] font-medium text-error">
            {error}
          </p>
        ) : shares === null ? (
          <div role="status" aria-label="Loading your shares" className="grid gap-3 border-b border-border py-4">
            <div className="h-4 w-2/3 rounded-sm bg-surface-alt motion-safe:animate-pulse" />
            <div className="h-4 w-1/2 rounded-sm bg-surface-alt motion-safe:animate-pulse" />
          </div>
        ) : shares.length === 0 ? (
          <p className="border-b border-border py-3 text-[0.875rem] text-text-secondary">
            You haven&apos;t shared anything yet. Share a reviewer or format from its page.
          </p>
        ) : (
          <ul className="flex flex-col">
            {shares.map((s) => (
              <li
                key={s.code}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="break-words text-[0.9375rem] font-medium text-text-primary">{s.title}</div>
                  <div className="mt-px text-[0.8125rem] text-text-secondary">
                    <span className="font-sans font-semibold tracking-[0.12em]">{s.code}</span>
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
                  <button onClick={() => setPending(s)} className={dangerButton}>
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
      </div>
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
    </Section>
  );
}

type SyncStatus = { kind: "ok" | "error" | "never"; text: string };

export default function AccountPage() {
  const router = useRouter();
  const { user, configured, signOut } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ kind: "never", text: "Never" });
  const [confirmingAccountDelete, setConfirmingAccountDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { profile, refreshProfile } = useDisplayNamePrompt();
  const [pwMode, setPwMode] = useState<"change" | "set" | null>(null);
  const [editingName, setEditingName] = useState(false);

  // localStorage is a browser-only external store; one-off read on mount is intentional.
  useEffect(() => {
    const meta = getSyncMeta();
    if (meta.lastSyncedAt) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSyncStatus({ kind: "ok", text: formatSyncTime(meta.lastSyncedAt) });
    } else if (meta.lastError) {
      setSyncStatus({ kind: "error", text: meta.lastError });
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
        meta.lastSyncedAt
          ? { kind: "ok", text: formatSyncTime(meta.lastSyncedAt) }
          : { kind: "ok", text: "Just now" },
      );
    } else {
      setSyncStatus({ kind: "error", text: result.error ?? "Sync failed." });
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

  // User metadata updates arrive through AuthProvider (USER_UPDATED), so this
  // re-reads after a password is set.
  const userHasPassword = user ? hasPassword(user) : false;
  const handle = profile ? formatHandle(profile.displayName, profile.tag) : null;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <BackLink href="/">Home</BackLink>
      <h1 className="text-[1.625rem] font-semibold text-text-primary">Account</h1>

      {/* Outside the signed-in branch so the offline log-out notice survives sign-out. */}
      {notice && (
        <p role="status" className="mt-4 rounded-lg bg-surface-alt px-3 py-2 text-[0.875rem] text-text-secondary">
          {notice}
        </p>
      )}

      {!user ? (
        configured ? (
          <div className="mt-6 border-t border-border pt-6">
            <h2 className="text-[1.1875rem] font-semibold text-text-primary">Sync your reviewers</h2>
            <p className="mt-2 max-w-prose text-[0.9375rem] text-text-secondary">
              Sign in to back up your reviewers, history and settings, and use them on another device.
              Everything still works without an account.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-flex min-h-[44px] items-center rounded-lg bg-accent px-4 py-2 text-[0.9375rem] font-medium text-on-accent hover:bg-accent-hover"
            >
              Sign in
            </Link>
          </div>
        ) : (
          <p className="mt-6 border-y border-border py-3 text-[0.9375rem] text-text-secondary">
            Sync isn&apos;t set up on this build yet. Everything stays on this device.
          </p>
        )
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
            <div
              aria-hidden="true"
              className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-accent text-on-accent"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                <path d="M10 9.2a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Zm-6.4 7.2c.5-3.1 3.2-5.2 6.4-5.2s5.9 2.1 6.4 5.2a.9.9 0 0 1-.9 1H4.5a.9.9 0 0 1-.9-1Z" />
              </svg>
            </div>
            {/* The min width pushes Log out to its own line on phones, so the email isn't cut off. */}
            <div className="min-w-[12rem] flex-1">
              {handle ? (
                <div className="truncate text-[1.1875rem] font-semibold text-text-primary" title={handle}>
                  {handle}
                </div>
              ) : (
                <div className="text-[1.1875rem] font-semibold text-text-secondary">No display name yet</div>
              )}
              <div className="truncate text-[0.875rem] text-text-secondary" title={user.email ?? undefined}>
                {user.email}
              </div>
            </div>
            <button onClick={() => void signOutKept()} className={secondaryButton}>
              Log out
            </button>
          </div>

          <Section title="Profile">
            <Row
              label="Display name"
              hint={editingName ? undefined : (handle ?? "Not set. You need one to share.")}
              below={
                editingName ? (
                  <div className="mt-2 max-w-sm">
                    <DisplayNameForm
                      key={profile ? `${profile.displayName}#${profile.tag}` : "none"}
                      initial={profile}
                      onSaved={() => {
                        setEditingName(false);
                        void refreshProfile();
                      }}
                      extraActions={
                        <button
                          type="button"
                          onClick={() => setEditingName(false)}
                          className="min-h-[44px] rounded-lg px-4 py-2 text-[0.9375rem] font-medium text-text-secondary hover:bg-surface-alt hover:text-text-primary"
                        >
                          Cancel
                        </button>
                      }
                    />
                  </div>
                ) : null
              }
            >
              {!editingName && (
                <button onClick={() => setEditingName(true)} className={secondaryButton}>
                  {profile ? "Edit" : "Set name"}
                </button>
              )}
            </Row>
          </Section>

          <Section title="Sign-in methods">
            {hasProvider(user, "google") && (
              <Row label="Google" hint="Sign in with your Google account.">
                <span className="inline-flex items-center gap-1.5 text-[0.9375rem] text-text-secondary">
                  <CheckIcon />
                  Connected
                </span>
              </Row>
            )}
            <Row
              label="Password"
              hint={
                userHasPassword
                  ? "Sign in with your email and password."
                  : "Not set. Add one to also sign in with your email."
              }
            >
              <button onClick={() => setPwMode(userHasPassword ? "change" : "set")} className={secondaryButton}>
                {userHasPassword ? "Change" : "Set password"}
              </button>
            </Row>
          </Section>

          <Section
            title="Sync"
            note="Your reviewers, history and settings sync across devices. Uploaded files stay on each device."
          >
            <Row label={syncStatus.kind === "error" ? "Sync problem" : "Last synced"} hint={syncStatus.text}>
              <button onClick={() => void syncNowManual()} disabled={syncing} className={secondaryButton}>
                {syncing ? "Syncing…" : "Sync now"}
              </button>
            </Row>
          </Section>

          {configured && <SharesSection />}

          <div className="mt-16 border-t border-border">
            <Row label="Delete account" hint="Permanently removes your data from the cloud and this device.">
              <button onClick={() => setConfirmingAccountDelete(true)} className={dangerButton}>
                Delete account
              </button>
            </Row>
          </div>
        </>
      )}

      {pwMode && user?.email && (
        <PasswordDialog
          email={user.email}
          mode={pwMode}
          onDone={(message) => {
            setPwMode(null);
            setNotice(message);
          }}
          onClose={() => setPwMode(null)}
        />
      )}

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
