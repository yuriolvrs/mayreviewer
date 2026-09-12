"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import FormatBuilder from "@/app/components/FormatBuilder";
import {
  cloneFormat,
  getAllFormats,
  getBuiltinFormats,
  saveCustomFormat,
} from "@/app/lib/examFormats";
import { cloneFormatAttachments } from "@/app/lib/attachments";
import { useFormats } from "@/app/lib/useFormats";

export default function EditFormatPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const formats = useFormats();
  const isBuiltin = getBuiltinFormats().some((b) => b.id === id);
  // Customs arrive after mount, so an unknown id reads as missing on the
  // first render either way — both server and client agree, no mismatch.
  const custom = !isBuiltin ? formats.find((f) => f.id === id) ?? null : null;

  function cloneAndEdit() {
    const source = getAllFormats().find((f) => f.id === id);
    if (!source) return;
    const copy = cloneFormat(source);
    saveCustomFormat(copy);
    // Files follow in the background; the copy is complete without them (it
    // keeps the past-exam text), so a storage failure must not strand the user.
    void cloneFormatAttachments(source.id, copy.id).catch(() => {});
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
        <span className="text-text-tertiary">{isBuiltin ? "Edit format" : "Format"}</span>
      </nav>

      {!custom ? (
        <>
          <h1 className="text-[26px] font-semibold text-text-primary">
            {isBuiltin ? "Can't edit this format" : "Format not found"}
          </h1>
          <p className="mt-1 text-[15px] text-text-secondary">
            {isBuiltin
              ? "Built-in formats are read-only. Clone it to make your own editable copy."
              : "No format with this id exists in the library."}
          </p>
          {isBuiltin && (
            <div className="mt-6">
              <button
                type="button"
                onClick={cloneAndEdit}
                className="rounded-lg bg-accent px-4 py-2.5 text-[15px] font-medium text-white hover:bg-accent-hover"
              >
                Clone and edit
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <h1 className="text-[26px] font-semibold text-text-primary">Edit format</h1>
          <p className="mt-1 text-[15px] text-text-secondary">
            Reviewers already on this format keep their questions. New generations use the
            edited definition.
          </p>
          <div className="mt-6">
            {/* Keyed by id: navigating between two edits remounts instead of
                showing the previous format's state. */}
            <FormatBuilder
              key={custom.id}
              initial={custom}
              formatId={custom.id}
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
