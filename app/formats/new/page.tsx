"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import FormatBuilder from "@/app/components/FormatBuilder";
import { newFormatId, saveCustomFormat, type ExamFormat } from "@/app/lib/examFormats";

export default function NewFormatPage() {
  const router = useRouter();
  // Minted once: a re-render must not re-roll the id under the form.
  const [draft] = useState<ExamFormat>(() => ({
    id: newFormatId(),
    name: "",
    description: "",
    types: [],
  }));

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
        <span className="text-text-tertiary">New format</span>
      </nav>

      <h1 className="text-[26px] font-semibold text-text-primary">New format</h1>
      <p className="mt-1 text-[15px] text-text-secondary">
        Define the question types once. Every reviewer on this format generates from it.
      </p>

      <div className="mt-6">
        <FormatBuilder
          initial={draft}
          formatId={draft.id}
          saveLabel="Create format"
          onSave={(format) => {
            saveCustomFormat(format);
            router.push("/formats");
          }}
        />
      </div>
    </div>
  );
}
