"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import FormatBuilder from "@/app/components/FormatBuilder";
import {
  cloneFormat,
  getAllFormats,
  getCustomFormats,
  saveCustomFormat,
  type ExamFormat,
} from "@/app/lib/examFormats";

export default function EditFormatPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const custom = getCustomFormats().find((f) => f.id === id);
  const [draft] = useState<ExamFormat | null>(custom ?? null);

  function cloneAndEdit() {
    const source = getAllFormats().find((f) => f.id === id);
    if (!source) return;
    const copy = cloneFormat(source);
    saveCustomFormat(copy);
    router.push(`/formats/${copy.id}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
      <nav
        aria-label="Breadcrumb"
        className="mb-2 flex items-center gap-1.5 text-[12px] tracking-wide uppercase"
      >
        <Link href="/formats" className="text-text-secondary hover:text-text-primary">
          Formats
        </Link>
        <span aria-hidden="true" className="text-text-tertiary">
          /
        </span>
        <span className="text-text-tertiary">Edit format</span>
      </nav>

      {!draft ? (
        <>
          <h1 className="text-[26px] font-semibold text-text-primary">Can&apos;t edit this format</h1>
          <p className="mt-1 text-[15px] text-text-secondary">
            Built-in formats are read-only. Clone it to make your own editable copy.
          </p>
          <div className="mt-6">
            <button
              type="button"
              onClick={cloneAndEdit}
              className="rounded-lg bg-accent px-4 py-2.5 text-[15px] font-medium text-white hover:bg-accent-hover"
            >
              Clone and edit
            </button>
          </div>
        </>
      ) : (
        <>
          <h1 className="text-[26px] font-semibold text-text-primary">Edit format</h1>
          <p className="mt-1 text-[15px] text-text-secondary">
            Reviewers already on this format keep their questions. New generations use the
            edited definition.
          </p>
          <div className="mt-6">
            <FormatBuilder
              initial={draft}
              formatId={draft.id}
              saveLabel="Save format"
              onSave={(format) => {
                saveCustomFormat(format);
                router.push("/formats");
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
