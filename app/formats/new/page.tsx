"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import FormatBuilder from "@/app/components/FormatBuilder";
import BackLink from "@/app/components/BackLink";
import PageSkeleton from "@/app/components/PageSkeleton";
import {
  cloneFormat,
  getAllFormats,
  newFormatId,
  saveCustomFormat,
  type ExamFormat,
} from "@/app/lib/examFormats";
import { cloneFormatAttachments } from "@/app/lib/attachments";
import { flagFormatSaved } from "@/app/lib/formatSaved";

export default function NewFormatPage() {
  const router = useRouter();
  // The draft is minted on mount, not during render: `?from=<id>` seeds it
  // with a copy of that format (customs live in localStorage, which the
  // server render cannot see). A re-render must not re-roll the id under
  // the form, so it is set once and never recomputed.
  const [draft, setDraft] = useState<ExamFormat | null>(null);
  // Set when the draft is a clone, so the source's past-exam files can follow
  // it on save. Copying them earlier would leave orphans if the draft is dropped.
  const [sourceId, setSourceId] = useState<string | null>(null);

  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get("from");
    const source = from ? getAllFormats().find((f) => f.id === from) : undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(
      source ? cloneFormat(source) : { id: newFormatId(), name: "", description: "", types: [] },
    );
    setSourceId(source?.id ?? null);
  }, []);

  if (!draft) return <PageSkeleton />;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
      <BackLink href="/formats">Formats</BackLink>

      <h1 className="text-[1.625rem] font-semibold text-text-primary">New format</h1>
      <p className="mt-1 text-[0.9375rem] text-text-secondary">
        {sourceId
          ? "This is a copy. Nothing is saved until you press Create format."
          : "Define the question types once. Every reviewer on this format generates from it."}
      </p>

      <div className="mt-6">
        {draft && (
          <FormatBuilder
            initial={draft}
            formatId={draft.id}
            saveLabel="Create format"
            isNew
            onSave={(format) => {
              saveCustomFormat(format);
              if (sourceId) {
                void cloneFormatAttachments(sourceId, format.id).catch(() => {});
              }
              flagFormatSaved();
              router.push("/formats");
            }}
            onDiscard={() => router.push("/formats")}
          />
        )}
      </div>
    </div>
  );
}
