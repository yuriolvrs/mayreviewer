"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatHandle } from "@/app/lib/profile";
import BackLink from "@/app/components/BackLink";
import { listGallery, normalizeShareCode, type GalleryRow, type ShareKind } from "@/app/lib/shares";

const PAGE_SIZE = 24;
type KindFilter = "all" | ShareKind;

export default function BrowsePage() {
  const router = useRouter();
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [rows, setRows] = useState<GalleryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    // Fetch on mount and whenever the filters change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    void listGallery({
      query,
      kind: kind === "all" ? undefined : kind,
      limit: PAGE_SIZE,
      offset: 0,
    }).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        setRows([]);
        setHasMore(false);
        return;
      }
      setRows(res.rows);
      setHasMore(res.rows.length === PAGE_SIZE);
    });
    return () => {
      cancelled = true;
    };
  }, [query, kind]);

  async function loadMore() {
    setLoadingMore(true);
    const res = await listGallery({
      query,
      kind: kind === "all" ? undefined : kind,
      limit: PAGE_SIZE,
      offset: rows.length,
    });
    setLoadingMore(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setRows((prev) => {
      const seen = new Set(prev.map((r) => r.code));
      return [...prev, ...res.rows.filter((r) => !seen.has(r.code))];
    });
    setHasMore(res.rows.length === PAGE_SIZE);
  }

  function openCode(e: React.FormEvent) {
    e.preventDefault();
    const code = normalizeShareCode(codeInput);
    if (!code) {
      setCodeError("That code isn't valid. A code has 6 letters and numbers.");
      return;
    }
    setCodeError("");
    router.push(`/s/${code}`);
  }

  const input =
    "min-h-11 rounded-lg border border-border bg-surface px-3 text-[0.9375rem] text-text-primary";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-8">
      <BackLink href="/">Home</BackLink>
      <h1 className="text-[1.625rem] font-semibold text-text-primary">Browse</h1>
      <p className="mt-1 text-[0.9375rem] text-text-secondary">
        Find reviewers and formats that others shared.
      </p>

      <form onSubmit={openCode} className="mt-6">
        <label htmlFor="share-code" className="block text-[0.875rem] font-medium text-text-primary">
          Have a code?
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="share-code"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="Enter a code or link"
            autoComplete="off"
            aria-invalid={codeError ? true : undefined}
            className={`${input} min-w-0 flex-1`}
          />
          <button
            type="submit"
            className="min-h-11 rounded-lg bg-accent px-4 text-[0.9375rem] font-medium text-on-accent hover:bg-accent-hover"
          >
            Open
          </button>
        </div>
        {codeError && (
          <p role="alert" className="mt-1 text-[0.875rem] text-error">
            {codeError}
          </p>
        )}
      </form>

      <div className="mt-8 flex flex-wrap gap-2">
        <input
          type="search"
          aria-label="Search shares"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title or subject"
          className={`${input} min-w-0 flex-1`}
        />
        <select
          aria-label="Filter by kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as KindFilter)}
          className={input}
        >
          <option value="all">All</option>
          <option value="reviewer">Reviewers</option>
          <option value="format">Formats</option>
        </select>
      </div>

      <div className="mt-4" aria-live="polite">
        {loading ? (
          <p className="text-[0.9375rem] text-text-secondary">Loading...</p>
        ) : error ? (
          <p role="alert" className="text-[0.9375rem] text-error">
            {error}
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-[0.9375rem] text-text-secondary">
            Nothing here yet.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {rows.map((r) => (
              <li key={r.code}>
                <Link
                  href={`/s/${r.code}`}
                  className="flex h-full flex-col gap-1 rounded-lg border border-border bg-surface p-4 hover:border-border-strong"
                >
                  <span className="text-[1rem] font-semibold text-text-primary">{r.title}</span>
                  {r.subject && (
                    <span className="text-[0.875rem] text-text-secondary">{r.subject}</span>
                  )}
                  <span className="mt-1 text-[0.8125rem] text-text-tertiary">
                    {r.kind === "reviewer" ? "Reviewer" : "Format"}
                    {r.kind === "reviewer" ? ` · ${r.questionCount} questions` : ""}
                    {" · "}
                    {r.authorName && r.authorTag ? formatHandle(r.authorName, r.authorTag) : "Anonymous"}
                    {" · "}
                    {new Date(r.updatedAt).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {!loading && hasMore && (
          <button
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="mt-4 min-h-11 rounded-lg border border-border bg-surface px-4 text-[0.9375rem] font-medium text-text-secondary hover:border-border-strong disabled:opacity-60"
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}
