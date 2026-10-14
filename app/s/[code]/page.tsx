"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import BackLink from "@/app/components/BackLink";
import PageSkeleton from "@/app/components/PageSkeleton";
import {
  canonicalFormatId,
  getBuiltinFormats,
  getCustomFormats,
  saveCustomFormat,
  type ExamFormat,
} from "@/app/lib/examFormats";
import { newId } from "@/app/lib/ids";
import { formatHandle } from "@/app/lib/profile";
import { saveReviewer } from "@/app/lib/storage";
import {
  getShare,
  recordShareAdd,
  reportShare,
  validateSharedFormat,
  validateSharedReviewer,
  type ReviewerSnapshot,
  type ShareRow,
} from "@/app/lib/shares";
import { formatForLibrary, planReviewerFormat, reviewerFromSnapshot } from "@/app/lib/sharedImport";
import type { Question } from "@/app/types";

type Load =
  | { state: "loading" }
  | { state: "missing" }
  | { state: "error"; message: string }
  | { state: "found"; share: ShareRow };

type Added = { href: string; label: string };

const PREVIEW_COUNT = 3;

function Preview({ questions }: { questions: Question[] }) {
  return (
    <ol className="mt-3 flex flex-col gap-3">
      {questions.slice(0, PREVIEW_COUNT).map((q, i) => (
        <li key={q.id} className="rounded-lg border border-border bg-surface p-4">
          <p className="text-[0.9375rem] text-text-primary">
            {i + 1}. {q.question}
          </p>
          {q.options.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-[0.875rem] text-text-secondary">
              {q.options.map((o, j) => (
                <li key={j}>{o}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

function ReportDialog({ code, onClose }: { code: string; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function send() {
    setSending(true);
    setError("");
    const res = await reportShare(code, reason);
    setSending(false);
    if (res.ok) setSent(true);
    else setError(res.error);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Report this share"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6">
        <h2 className="text-[1.125rem] font-semibold text-text-primary">Report this share</h2>
        {sent ? (
          <p role="status" className="mt-3 text-[0.9375rem] text-success">
            Thanks. We got your report.
          </p>
        ) : (
          <>
            <label htmlFor="report-reason" className="mt-3 block text-[0.875rem] text-text-secondary">
              What is wrong with it?
            </label>
            <textarea
              id="report-reason"
              value={reason}
              maxLength={500}
              rows={4}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface p-2 text-[0.9375rem] text-text-primary"
            />
            <p className="text-right text-[0.75rem] text-text-tertiary">{reason.length}/500</p>
            {error && (
              <p role="alert" className="mt-1 text-[0.875rem] text-error">
                {error}
              </p>
            )}
          </>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="min-h-11 rounded-lg px-4 text-[0.9375rem] font-medium text-text-secondary hover:bg-surface-alt"
          >
            {sent ? "Close" : "Cancel"}
          </button>
          {!sent && (
            <button
              onClick={() => void send()}
              disabled={sending || reason.trim().length === 0}
              className="min-h-11 rounded-lg bg-accent px-4 text-[0.9375rem] font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
            >
              {sending ? "Sending..." : "Send report"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SharePage() {
  const params = useParams<{ code: string }>();
  const code = params.code;
  const { user } = useAuth();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [added, setAdded] = useState<Added | null>(null);
  const [addError, setAddError] = useState("");
  const [reporting, setReporting] = useState(false);
  const addingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void getShare(code).then((res) => {
      if (cancelled) return;
      if (!res.ok) setLoad({ state: "error", message: res.error });
      else if (!res.share) setLoad({ state: "missing" });
      else setLoad({ state: "found", share: res.share });
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const share = load.state === "found" ? load.share : null;
  const parsed = useMemo<
    { kind: "reviewer"; snap: ReviewerSnapshot } | { kind: "format"; format: ExamFormat } | null
  >(() => {
    if (!share) return null;
    if (share.kind === "reviewer") {
      const snap = validateSharedReviewer(share.data);
      return snap ? { kind: "reviewer", snap } : null;
    }
    const format = validateSharedFormat(share.data);
    return format ? { kind: "format", format } : null;
  }, [share]);

  function add() {
    if (!parsed || !share || addingRef.current || added) return;
    addingRef.current = true;
    setAddError("");
    try {
      if (parsed.kind === "reviewer") {
        const plan = planReviewerFormat(parsed.snap, getBuiltinFormats(), getCustomFormats());
        if (plan.toSave) saveCustomFormat(plan.toSave);
        const reviewer = reviewerFromSnapshot(parsed.snap, {
          id: newId(),
          formatId: plan.formatId,
          now: new Date().toISOString(),
        });
        saveReviewer(reviewer);
        setAdded({ href: `/reviewer/${reviewer.id}`, label: "Open the reviewer" });
      } else {
        const format = formatForLibrary(parsed.format);
        saveCustomFormat(format);
        setAdded({ href: `/formats/${format.id}`, label: "Open the format" });
      }
      if (!(user && user.id === share.ownerId)) void recordShareAdd(share.code);
    } catch (e) {
      addingRef.current = false;
      setAddError(e instanceof Error ? e.message : "Couldn't add it to your library.");
    }
  }

  if (load.state === "loading") return <PageSkeleton />;

  const box = "mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8";
  if (load.state === "missing") {
    return (
      <div className={box}>
        <h1 className="text-[1.625rem] font-semibold text-text-primary">Share not found</h1>
        <p className="mt-2 text-[0.9375rem] text-text-secondary">
          This share doesn&apos;t exist or was removed.
        </p>
        <Link href="/browse" className="mt-4 text-[0.9375rem] text-accent hover:underline">
          Browse shares
        </Link>
      </div>
    );
  }
  if (load.state === "error") {
    return (
      <div className={box}>
        <h1 className="text-[1.625rem] font-semibold text-text-primary">Can&apos;t open this share</h1>
        <p role="alert" className="mt-2 text-[0.9375rem] text-text-secondary">
          {load.message}
        </p>
      </div>
    );
  }
  if (!share) return null;
  if (!parsed) {
    return (
      <div className={box}>
        <h1 className="text-[1.625rem] font-semibold text-text-primary">This share is damaged</h1>
        <p className="mt-2 text-[0.9375rem] text-text-secondary">
          We can&apos;t read its content, so it can&apos;t be added.
        </p>
      </div>
    );
  }

  const isOwner = Boolean(user && user.id === share.ownerId);
  const author =
    share.authorName && share.authorTag ? formatHandle(share.authorName, share.authorTag) : "Anonymous";
  const formatName =
    parsed.kind === "reviewer"
      ? (parsed.snap.format?.name ??
        getBuiltinFormats().find((f) => f.id === canonicalFormatId(parsed.snap.examFormatId))?.name ??
        "Custom format")
      : parsed.format.name;
  const questions = parsed.kind === "reviewer" ? parsed.snap.questions : [];
  const detail: [string, string][] = [
    ["Format", formatName],
    parsed.kind === "reviewer"
      ? ["Questions", String(share.questionCount)]
      : ["Question types", String(parsed.format.types.length)],
    ["Author", author],
    ["Updated", new Date(share.updatedAt).toLocaleDateString()],
  ];

  return (
    <div className={box}>
      <BackLink href="/">Home</BackLink>
      <span className="w-fit rounded-full border border-border px-2.5 py-0.5 text-[0.8125rem] text-text-secondary">
        {share.kind === "reviewer" ? "Reviewer" : "Format"}
      </span>
      <h1 className="mt-2 text-[1.625rem] font-semibold text-text-primary">{share.title}</h1>
      {share.subject && <p className="mt-1 text-[0.9375rem] text-text-secondary">{share.subject}</p>}

      <dl className="mt-4 grid grid-cols-2 gap-3 text-[0.875rem]">
        {detail.map(([k, v]) => (
          <div key={k}>
            <dt className="text-text-tertiary">{k}</dt>
            <dd className="text-text-primary">{v}</dd>
          </div>
        ))}
      </dl>

      {questions.length > 0 && (
        <section className="mt-6">
          <h2 className="text-[0.9375rem] font-semibold text-text-primary">
            Preview (first {Math.min(PREVIEW_COUNT, questions.length)})
          </h2>
          <Preview questions={questions} />
        </section>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {added ? (
          <p role="status" className="text-[0.9375rem] text-success">
            Added to your library.{" "}
            <Link href={added.href} className="font-medium underline">
              {added.label}
            </Link>
          </p>
        ) : (
          <button
            onClick={add}
            className="min-h-11 rounded-lg bg-accent px-4 text-[0.9375rem] font-medium text-on-accent hover:bg-accent-hover"
          >
            Add to my library
          </button>
        )}
        {isOwner ? (
          <p className="text-[0.875rem] text-text-secondary">
            This is your share.{" "}
            <Link href="/account#shares" className="text-accent hover:underline">
              Manage it
            </Link>
          </p>
        ) : (
          <button
            onClick={() => setReporting(true)}
            className="min-h-11 rounded-lg px-3 text-[0.875rem] text-text-secondary hover:bg-surface-alt"
          >
            Report
          </button>
        )}
      </div>
      {addError && (
        <p role="alert" className="mt-2 text-[0.875rem] text-error">
          {addError}
        </p>
      )}
      {reporting && <ReportDialog code={share.code} onClose={() => setReporting(false)} />}
    </div>
  );
}
