"use client";

import Link from "next/link";
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

// Header button plus dialog. Hidden when Supabase is not configured.
export default function ShareButton({ source }: { source: ShareSource }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [addCount, setAddCount] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const configured = getSupabaseClient() !== null;
  const kind = source.kind;
  const sourceId = source.kind === "reviewer" ? source.reviewer.id : source.format.id;
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!configured || !userId) return;
    let cancelled = false;
    void getMyShare(kind, sourceId).then((r) => {
      if (cancelled) return;
      setAddCount(r.ok && r.share ? (r.share.addCount ?? 0) : null);
    });
    return () => {
      cancelled = true;
    };
  }, [configured, userId, kind, sourceId, reload]);

  if (!configured) return null;
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={() => setOpen(true)} className={SECONDARY}>
        Share
      </button>
      {userId && addCount !== null && (
        <p className="text-[0.8125rem] text-text-tertiary">{addCountLabel(addCount)}</p>
      )}
      {open && (
        <ShareDialog
          source={source}
          onClose={() => {
            setOpen(false);
            setReload((n) => n + 1);
          }}
        />
      )}
    </div>
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
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={save} disabled={busy} className={PRIMARY}>
            {busy ? "Saving." : share ? "Update share" : "Create share"}
          </button>
        </div>

        {share && (
          <div className="mt-6 w-full border-t border-border pt-4">
            <p className="text-[0.875rem] text-text-secondary">Share code</p>
            <p className="font-mono text-[1.25rem] font-semibold tracking-widest text-text-primary">
              {share.code}
            </p>
            <p className="mt-2 break-all text-[0.875rem] text-text-secondary">{link}</p>
            <p className="mt-1 text-[0.8125rem] text-text-tertiary">
              Updated {new Date(share.updatedAt).toLocaleString()}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => copy("link", link)} className={SECONDARY}>
                {copied === "link" ? "Copied" : "Copy link"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => copy("code", share.code)}
                className={SECONDARY}
              >
                {copied === "code" ? "Copied" : "Copy code"}
              </button>
            </div>
            <div className="mt-4">
              {confirmUnshare ? (
                <div className="flex flex-col gap-2">
                  <p className="text-[0.9375rem] text-text-secondary">
                    The link and code will stop working. Your own {noun} stays.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={remove}
                      className={`${BTN} bg-error text-on-error hover:opacity-90`}
                    >
                      Yes, unshare
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
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmUnshare(true)}
                  className={`${BTN} text-error hover:bg-surface-alt`}
                >
                  Unshare
                </button>
              )}
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
