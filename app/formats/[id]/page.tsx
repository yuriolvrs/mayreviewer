"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import FormatBuilder from "@/app/components/FormatBuilder";
import FormatPreview from "@/app/components/FormatPreview";
import PageSkeleton from "@/app/components/PageSkeleton";
import { getBuiltinFormats, saveCustomFormat } from "@/app/lib/examFormats";
import { flagFormatSaved } from "@/app/lib/formatSaved";
import { useFormats, useFormatsLoaded } from "@/app/lib/useFormats";

export default function EditFormatPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const formats = useFormats();
  const formatsLoaded = useFormatsLoaded();
  const builtin = getBuiltinFormats().find((b) => b.id === id) ?? null;
  // Customs arrive after mount, so an unknown id reads as missing on the
  // first render either way — both server and client agree, no mismatch.
  // Wait for the load before judging, so a custom format doesn't flash as
  // "not found".
  if (!formatsLoaded) return <PageSkeleton />;
  const custom = !builtin ? formats.find((f) => f.id === id) ?? null : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
      <nav
        aria-label="Breadcrumb"
        className="mb-2 flex items-center gap-1.5 text-[0.75rem] tracking-wide uppercase"
      >
        <Link href="/formats" className="text-text-secondary hover:text-text-primary">
          Formats
        </Link>
        <span aria-hidden="true" className="text-text-tertiary">
          /
        </span>
        <span className="text-text-tertiary">{custom ? "Edit format" : "Format"}</span>
      </nav>

      {builtin ? (
        <>
          <h1 className="text-[1.625rem] font-semibold text-text-primary">{builtin.name}</h1>
          <p className="mt-1 text-[0.9375rem] text-text-secondary">{builtin.description}</p>
          <p className="mt-1 text-[0.875rem] text-text-secondary">
            Built-in formats are read-only. Clone one to make your own editable copy.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href={`/reviewer/new?format=${encodeURIComponent(builtin.id)}`}
              className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 py-2.5 text-[0.9375rem] font-medium text-on-accent hover:bg-accent-hover"
            >
              Use this format
            </Link>
            <Link
              href={`/formats/new?from=${encodeURIComponent(builtin.id)}`}
              className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-4 py-2.5 text-[0.9375rem] font-medium text-text-primary hover:border-border-strong"
            >
              Clone to edit
            </Link>
          </div>
          <h2 className="mt-8 mb-3 text-[0.9375rem] font-semibold text-text-primary">
            What this format asks
          </h2>
          <FormatPreview format={builtin} />
        </>
      ) : !custom ? (
        <>
          <h1 className="text-[1.625rem] font-semibold text-text-primary">Format not found</h1>
          <p className="mt-1 text-[0.9375rem] text-text-secondary">
            No format with this id exists in the library.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-[1.625rem] font-semibold text-text-primary">Edit format</h1>
          <p className="mt-1 text-[0.9375rem] text-text-secondary">
            Reviewers already on this format keep their questions. New generations use the
            edited definition.
          </p>
          <details className="mt-4 rounded-lg border border-border bg-surface">
            <summary className="flex min-h-11 cursor-pointer items-center px-4 text-[0.9375rem] font-medium text-text-primary">
              Preview
            </summary>
            <div className="px-4 pb-4">
              <p className="mb-3 text-[0.875rem] text-text-secondary">
                Shows the saved version of this format, with placeholder questions.
              </p>
              <FormatPreview format={custom} />
            </div>
          </details>
          <div className="mt-6">
            {/* Keyed by id: navigating between two edits remounts instead of
                showing the previous format's state. */}
            <FormatBuilder
              key={custom.id}
              initial={custom}
              formatId={custom.id}
              saveLabel="Save format"
              isNew={false}
              onSave={(format) => {
                saveCustomFormat(format);
                flagFormatSaved();
                router.push("/formats");
              }}
              onDiscard={() => router.push("/formats")}
            />
          </div>
        </>
      )}
    </div>
  );
}
