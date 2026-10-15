"use client";

import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth, useDisplayNamePrompt } from "@/app/components/AuthProvider";
import { getSupabaseClient } from "@/app/lib/supabase";
import { formatHandle } from "@/app/lib/profile";
import { addCountLabel, getMyShare, unshare, upsertShare } from "@/app/lib/shares";
import type { ShareRow } from "@/app/lib/shares";
import { buildShareContent } from "@/app/lib/shareInput";
import type { ShareSource } from "@/app/lib/shareInput";

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), a[href]";
const BTN =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 py-2 text-[0.9375rem] font-medium disabled:cursor-not-allowed disabled:opacity-40";
const PRIMARY = `${BTN} bg-accent text-on-accent hover:bg-accent-hover`;
const SECONDARY = `${BTN} border border-border bg-surface text-text-primary hover:border-border-strong`;

// Fired when the share dialog closes so <ShareStatus> can refetch.
const SHARE_CHANGED_EVENT = "mayreviewer:share-changed";

// Header button plus dialog. Hidden when Supabase is not configured.
export default function ShareButton({ source }: { source: ShareSource }) {
  const [open, setOpen] = useState(false);
  if (getSupabaseClient() === null) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={SECONDARY}>
        Share
      </button>
      {open && (
        <ShareDialog
          source={source}
          onClose={() => {
            setOpen(false);
            window.dispatchEvent(new Event(SHARE_CHANGED_EVENT));
          }}
        />
      )}
    </>
  );
}

const DATE_FMT: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };

// Line under the reviewer's format: add count plus created and updated dates.
// Renders nothing until the owner has a share.
export function ShareStatus({ kind, sourceId }: { kind: "reviewer" | "format"; sourceId: string }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [share, setShare] = useState<ShareRow | null>(null);
  const [reload, setReload] = useState(0);
  const configured = getSupabaseClient() !== null;

  useEffect(() => {
    const onChanged = () => setReload((n) => n + 1);
    window.addEventListener(SHARE_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(SHARE_CHANGED_EVENT, onChanged);
  }, []);

  useEffect(() => {
    if (!configured || !userId) return;
    let cancelled = false;
    void getMyShare(kind, sourceId).then((r) => {
      if (!cancelled) setShare(r.ok ? r.share : null);
    });
    return () => {
      cancelled = true;
    };
  }, [configured, userId, kind, sourceId, reload]);

  if (!configured || !userId || !share) return null;
  const created = share.createdAt ? new Date(share.createdAt).toLocaleDateString(undefined, DATE_FMT) : null;
  const updated = new Date(share.updatedAt).toLocaleDateString(undefined, DATE_FMT);
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[0.875rem] text-text-secondary">
      <span className="font-medium text-text-primary">Shared</span>
      <span aria-hidden="true">·</span>
      <span>{addCountLabel(share.addCount ?? 0)}</span>
      {created && (
        <>
          <span aria-hidden="true">·</span>
          <span>Created {created}</span>
        </>
      )}
      <span aria-hidden="true">·</span>
      <span>Updated {updated}</span>
    </p>
  );
}

// Icon-only copy button. Swaps to a check and shows a short "Copied" bubble
// once the copy worked; a live region says it for screen readers.
function CopyIconButton({
  label,
  done,
  disabled,
  onClick,
}: {
  label: string;
  done: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={onClick}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-surface hover:text-text-primary disabled:opacity-40"
      >
        {done ? (
          <Check size={18} aria-hidden="true" className="text-accent" />
        ) : (
          <Copy size={18} aria-hidden="true" />
        )}
      </button>
      {done && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-5 right-0 whitespace-nowrap rounded bg-text-primary px-2 py-0.5 text-[0.75rem] font-medium text-surface"
        >
          Copied
        </span>
      )}
      <span role="status" className="sr-only">
        {done ? "Copied" : ""}
      </span>
    </span>
  );
}

function ShareDialog({ source, onClose }: { source: ShareSource; onClose: () => void }) {
  const { user, loading } = useAuth();
  const { profile, openDisplayNamePrompt } = useDisplayNamePrompt();
  const ref = useRef<HTMLDivElement>(null);
  const [share, setShare] = useState<ShareRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [listed, setListed] = useState(false);
  const [showName, setShowName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [confirmUnshare, setConfirmUnshare] = useState(false);

  const kind = source.kind;
  const sourceId = source.kind === "reviewer" ? source.reviewer.id : source.format.id;
  const userId = user?.id ?? null;
  const content = useMemo(() => buildShareContent(source), [source]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void getMyShare(kind, sourceId).then((r) => {
      if (cancelled) return;
      if (!r.ok) setError(r.error);
      else if (r.share) {
        setShare(r.share);
        setListed(r.share.listed);
        setShowName(r.share.showName === true);
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, kind, sourceId]);

  // Document-level so Escape works even when focus fell back to <body> after
  // the dialog's content changed.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Tab" || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const edge = e.shiftKey ? items[0] : items[items.length - 1];
    if (document.activeElement === edge) {
      e.preventDefault();
      (e.shiftKey ? items[items.length - 1] : items[0]).focus();
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    const r = await upsertShare({ ...content, listed, showName });
    setBusy(false);
    if (r.ok) setShare(r.share);
    else setError(r.error);
  }

  async function remove() {
    if (!share) return;
    setBusy(true);
    setError(null);
    const r = await unshare(share.code);
    setBusy(false);
    if (r.ok) {
      setShare(null);
      setListed(false);
      setShowName(false);
      setConfirmUnshare(false);
    } else setError(r.error);
  }

  async function copy(which: "link" | "code", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied((c) => (c === which ? null : c)), 2000);
    } catch {
      setError("Could not copy. Select the text and copy it by hand.");
    }
  }

  const link = share ? `${window.location.origin}/s/${share.code}` : "";
  const noun = kind === "reviewer" ? "reviewer" : "format";

  let body: React.ReactNode;
  if (loading || (user && profile && !loaded)) {
    body = <p className="text-[0.9375rem] text-text-secondary">Loading.</p>;
  } else if (!user) {
    body = (
      <>
        <p className="text-[0.9375rem] text-text-secondary">Sign in to share this {noun}.</p>
        <Link href="/login" className={`${PRIMARY} mt-4`}>
          Sign in to share
        </Link>
      </>
    );
  } else if (!profile) {
    body = (
      <>
        <p className="text-[0.9375rem] text-text-secondary">
          Pick a display name first. It shows on your shares if you choose.
        </p>
        <button type="button" onClick={openDisplayNamePrompt} className={`${PRIMARY} mt-4`}>
          Pick a display name
        </button>
      </>
    );
  } else {
    body = (
      <>
        <p className="text-[0.9375rem] text-text-secondary">
          Only the questions are shared. Your notes, files and past exams stay private.
        </p>
        <div className="mt-4 flex flex-col gap-1">
          <label className="flex min-h-[44px] items-center gap-3 text-[0.9375rem] text-text-primary">
            <input
              type="checkbox"
              checked={listed}
              disabled={busy}
              onChange={(e) => setListed(e.target.checked)}
              className="size-5 shrink-0"
            />
            List publicly on Browse
          </label>
          <label className="flex min-h-[44px] items-center gap-3 text-[0.9375rem] text-text-primary">
            <input
              type="checkbox"
              checked={showName}
              disabled={busy}
              onChange={(e) => setShowName(e.target.checked)}
              className="size-5 shrink-0"
            />
            Show my name ({formatHandle(profile.displayName, profile.tag)})
          </label>
        </div>
        <div className="mt-4 flex w-full flex-col items-center gap-2">
          <button type="button" onClick={save} disabled={busy} className={PRIMARY}>
            {busy ? "Saving." : share ? "Update share" : "Create share"}
          </button>
        </div>

        {share && (
          <div className="mt-5 w-full rounded-lg border border-border bg-surface-alt px-4 pb-1 pt-3">
            <p className="text-center text-[0.75rem] font-medium uppercase tracking-wide text-text-tertiary">
              Share code
            </p>
            {/* Spacer column mirrors the icon column so the text is truly centered. */}
            <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center">
              <span aria-hidden="true" />
              <p className="select-all text-center font-sans text-[1.75rem] font-semibold leading-tight tracking-[0.2em] text-text-primary">
                {share.code}
              </p>
              <CopyIconButton
                label="Copy code"
                done={copied === "code"}
                disabled={busy}
                onClick={() => copy("code", share.code)}
              />
            </div>
            <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center">
              <span aria-hidden="true" />
              <p className="break-all text-center text-[0.8125rem] text-text-secondary">{link}</p>
              <CopyIconButton
                label="Copy link"
                done={copied === "link"}
                disabled={busy}
                onClick={() => copy("link", link)}
              />
            </div>
            {!confirmUnshare && (
              <div className="flex justify-center border-t border-border">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmUnshare(true)}
                  className={`${BTN} min-h-[44px] px-3 text-[0.875rem] text-error hover:bg-surface`}
                >
                  Stop sharing
                </button>
              </div>
            )}
          </div>
        )}

        {share && confirmUnshare && (
          <div className="mt-4 flex w-full flex-col gap-3 rounded-lg border border-error p-4">
            <p className="text-[0.9375rem] text-text-primary">
              The link and code will stop working. Your own {noun} stays.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={remove}
                className={`${BTN} bg-error text-on-error hover:opacity-90`}
              >
                Yes, stop sharing
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmUnshare(false)}
                className={SECONDARY}
              >
                Keep sharing
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-dialog-title"
      ref={ref}
      onKeyDown={handleKeyDown}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-surface p-6 shadow-menu">
        <h2 id="share-dialog-title" className="text-[1.1875rem] font-semibold text-text-primary">
          Share this {noun}
        </h2>
        <div className="mt-3 flex flex-col items-start">{body}</div>
        {error && (
          <p role="alert" className="mt-3 text-[0.9375rem] font-medium text-error">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={onClose} className={SECONDARY}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
