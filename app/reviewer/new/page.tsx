"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { newId } from "@/app/lib/ids";
import BackLink from "@/app/components/BackLink";
import { useTopicList } from "@/app/lib/useTopics";
import { saveReviewer } from "@/app/lib/storage";
import { getSettings } from "@/app/lib/settings";
import {
  MAX_QUESTION_COUNT,
  MIN_QUESTION_COUNT,
  splitCountEvenly,
  sumCounts,
} from "@/app/lib/questions";
import { addAttachment } from "@/app/lib/attachments";
import {
  MAX_ID_CHARS,
  OS_EXAM,
  canonicalFormatId,
  defaultCounts,
  getBuiltinFormats,
  newFormatId,
  resolveFromList,
  saveCustomFormat,
  type ExamFormat,
  type FormatTypeDef,
} from "@/app/lib/examFormats";
import { useFormats } from "@/app/lib/useFormats";
import { parseReviewerFile, type ParsedReviewerFile } from "@/app/lib/reviewerFile";
import ReviewerInfoFields from "@/app/components/ReviewerInfoFields";
import TopicsField from "@/app/components/TopicsField";
import { FormatPicker, QuestionCountSection } from "@/app/components/FormatPicker";
import GeneratedFormatPanel from "@/app/components/GeneratedFormatPanel";
import SourceSections from "@/app/components/SourceSections";
import type { Reviewer } from "@/app/types";

export default function NewReviewerPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const topicList = useTopicList([]);
  const [countByType, setCountByType] = useState<Record<string, number>>(() =>
    // Seeded from Settings so the user's default count carries into new reviewers.
    splitCountEvenly(getSettings().defaultCount),
  );
  // Customs arrive after mount (see useFormats): the first render is
  // built-ins-only on both server and client, so hydration always agrees.
  const [examFormatId, setExamFormatId] = useState<string>(OS_EXAM.id);
  const formats = useFormats();
  // "Learn from course material": a draft format built by inference. It is
  // not stored until Create or "Save to Formats", and keeps one id so saving
  // twice overwrites instead of duplicating.
  const [learn, setLearn] = useState(false);
  const [genTypes, setGenTypes] = useState<FormatTypeDef[]>([]);
  const [genName, setGenName] = useState("");
  const [genId] = useState(() => newFormatId());
  const [genSaved, setGenSaved] = useState(false);
  const genDefaultName = `${name.trim() || "New reviewer"} format`.slice(0, MAX_ID_CHARS);
  const genFormat: ExamFormat = {
    id: genId,
    name: genName.trim() || genDefaultName,
    description: "",
    types: genTypes,
  };
  const format = learn ? genFormat : resolveFromList(formats, examFormatId);
  const [linkApplied, setLinkApplied] = useState(false);

  // Deep link from the formats library ("Use this format"). Read on mount
  // rather than via useSearchParams, which would force a Suspense boundary
  // on this otherwise static page. Runs again once customs load, so a link
  // to a custom format still resolves.
  useEffect(() => {
    if (linkApplied) return;
    const id = new URLSearchParams(window.location.search).get("format");
    if (id && formats.some((f) => f.id === id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExamFormatId(id);
      setLearn(false);
      setCountByType(defaultCounts(resolveFromList(formats, id)));
      setLinkApplied(true);
    }
  }, [formats, linkApplied]);
  const [notes, setNotes] = useState("");
  const [projectMaterial, setProjectMaterial] = useState("");
  const [pastExamMaterial, setPastExamMaterial] = useState("");
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState(false);

  // Uploaded files are keyed by reviewer id in IndexedDB, so the id has to
  // exist before the reviewer does — it's minted here and reused on create so
  // anything attached while filling the form is already attached to the
  // reviewer that gets saved. Abandoning the form leaves those files orphaned;
  // they're inert without a reviewer pointing at them.
  const [draftId] = useState(() => newId());
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importDragOver, setImportDragOver] = useState(false);
  const [importPending, setImportPending] = useState<ParsedReviewerFile | null>(null);
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);

  function saveGenerated() {
    saveCustomFormat({
      ...genFormat,
      types: genTypes.map((t) => ({
        ...t,
        label: t.label.trim(),
        defaultCount: countByType[t.key] ?? t.defaultCount,
      })),
    });
    setGenSaved(true);
  }

  function selectSavedFormat(id: string) {
    // Counts typed for another format's types are meaningless after a
    // switch, so re-seed from the new format's mix.
    setError("");
    setLearn(false);
    setExamFormatId(id);
    setCountByType(defaultCounts(resolveFromList(formats, id)));
  }

  function selectLearn() {
    setError("");
    setLearn(true);
    setCountByType(Object.fromEntries(genTypes.map((t) => [t.key, t.defaultCount])));
  }

  // Derived, so the message sits next to the total and clears as it is fixed.
  const total = sumCounts(countByType);
  const learnPending = learn && genTypes.length === 0;
  const countError =
    !learnPending &&
    (!Number.isInteger(total) || total < MIN_QUESTION_COUNT || total > MAX_QUESTION_COUNT)
      ? `Questions to generate must be a whole number between ${MIN_QUESTION_COUNT} and ${MAX_QUESTION_COUNT}.`
      : "";
  const barError = error || countError || (nameError ? "Reviewer name is required." : "");

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(true);
      return;
    }
    if (learn && genTypes.length === 0) {
      setError("Suggest question types from your course material first, or pick another format.");
      return;
    }
    if (learn && genTypes.some((t) => !t.label.trim())) {
      setError("Every generated question type needs a label.");
      return;
    }
    const questionCount = total;
    // The count error is derived and already shown beside the total and in
    // the bar, so there is nothing to set here.
    if (countError) return;

    // The generated format becomes a stored custom format so every page can
    // resolve it by id. Re-saving the same id keeps one copy.
    if (learn) saveGenerated();
    const now = new Date().toISOString();
    const reviewer: Reviewer = {
      id: draftId,
      reviewerName: trimmed,
      subject: subject.trim(),
      topics: topicList.values().map((t) => t.trim()).filter(Boolean),
      notes,
      projectMaterial,
      pastExamMaterial,
      examFormatId: format.id,
      questionCount,
      questionCountByType: countByType,
      questions: [],
      createdAt: now,
      updatedAt: now,
      questionsGeneratedAt: now,
    };
    saveReviewer(reviewer);
    // Straight to Questions — if sources were attached while filling this form,
    // Generate is the very next thing to click.
    router.push(`/reviewer/${reviewer.id}?tab=questions`);
  }

  async function handleImportFileSelected(file: File) {
    setImportError("");
    setImportPending(null);

    let result: Awaited<ReturnType<typeof parseReviewerFile>>;
    try {
      result = await parseReviewerFile(file);
    } catch {
      setImportError("Couldn't read that file.");
      return;
    }
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    if (!result.data.reviewerName.trim()) {
      setImportError("That file doesn't include a reviewer name.");
      return;
    }
    setImportPending(result.data);
  }

  async function confirmImportCreate() {
    if (!importPending) return;
    setImporting(true);
    try {
      // A custom format embedded in the file joins the library (built-in ids
      // never overwrite the shipped definitions), and the new reviewer takes
      // the file's format when it carries a valid one.
      const embedded = importPending.format;
      const useFormatId =
        embedded && !getBuiltinFormats().some((f) => f.id === canonicalFormatId(embedded.id))
          ? (saveCustomFormat(embedded), embedded.id)
          : OS_EXAM.id;
      const now = new Date().toISOString();
      const reviewer: Reviewer = {
        id: newId(),
        reviewerName: importPending.reviewerName.trim(),
        subject: importPending.subject.trim(),
        topics: importPending.topics,
        notes: importPending.notes,
        projectMaterial: importPending.projectMaterial,
        // Imported files predate reviewer-level past exams — normalize()
        // defaults the field on read.
        pastExamMaterial: importPending.pastExamMaterial,
        // Imported files predate formats — they belong to the built-in they
        // were generated under. (normalize() would default this anyway.)
        examFormatId: useFormatId,
        questionCount: importPending.questionCount,
        questionCountByType:
          importPending.questionCountByType ?? splitCountEvenly(importPending.questionCount),
        questions: importPending.questions,
        createdAt: now,
        updatedAt: now,
        questionsGeneratedAt: now,
      };
      saveReviewer(reviewer);

      for (const attachment of importPending.attachments) {
        // .slice() copies into a fresh, exactly-sized ArrayBuffer — safer than
        // trusting the zip entry's own buffer to have no extra offset/padding.
        const bytes = attachment.data.slice();
        const file = new File([bytes.buffer as ArrayBuffer], attachment.name, {
          type: attachment.mimeType,
        });
        await addAttachment(reviewer.id, attachment.field, file);
      }

      router.push(`/reviewer/${reviewer.id}`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Couldn't create a reviewer from that file.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-8">
      <BackLink href="/">Reviewers</BackLink>

      <h1 className="text-[1.625rem] font-semibold text-text-primary">New reviewer</h1>

      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json,application/zip,.zip"
        aria-label="Import a reviewer file"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImportFileSelected(file);
          e.target.value = "";
        }}
      />
      <p className="mt-1 text-[0.875rem] text-text-secondary">
        Have an exported reviewer?{" "}
        <button
          type="button"
          onClick={() => importInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setImportDragOver(true);
          }}
          onDragLeave={() => setImportDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setImportDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) void handleImportFileSelected(file);
          }}
          className={`font-medium underline underline-offset-2 hover:text-accent ${
            importDragOver ? "text-accent" : "text-text-primary"
          }`}
        >
          Import an exported reviewer
        </button>
      </p>

      {importPending && (
        <div className="mt-4">
          <div className="rounded-lg border border-border bg-surface-alt p-4">
            <p className="text-[0.9375rem] font-medium text-text-primary">{importPending.fileName}</p>
            <dl className="mt-3 flex flex-col gap-1 text-[0.875rem]">
              <div className="flex gap-2">
                <dt className="text-text-secondary">Reviewer name</dt>
                <dd className="text-text-primary">{importPending.reviewerName}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-text-secondary">Questions in file</dt>
                <dd className="text-text-primary">{importPending.questions.length}</dd>
              </div>
              {importPending.topics.length > 0 && (
                <div className="flex gap-2">
                  <dt className="text-text-secondary">Topics in file</dt>
                  <dd className="text-text-primary">{importPending.topics.length}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="text-text-secondary">Questions to generate</dt>
                <dd className="text-text-primary">{importPending.questionCount}</dd>
              </div>
              {importPending.isArchive && (
                <div className="flex gap-2">
                  <dt className="text-text-secondary">Files in archive</dt>
                  <dd className="text-text-primary">{importPending.attachments.length}</dd>
                </div>
              )}
            </dl>
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setImportPending(null)}
                className="text-[0.9375rem] font-medium text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmImportCreate}
                disabled={importing}
                className="rounded-lg bg-accent px-4 py-2 text-[0.9375rem] font-medium text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {importing ? "Creating…" : "Create from file"}
              </button>
            </div>
          </div>
        </div>
      )}

      {importError && (
        <p role="alert" className="mt-2 text-[0.875rem] text-error">
          {importError}
        </p>
      )}

      <form onSubmit={handleCreate} className="mt-4 flex flex-col">
        <ReviewerInfoFields
          name={name}
          subject={subject}
          nameError={nameError}
          onNameChange={(v) => {
            setName(v);
            if (nameError) setNameError(false);
          }}
          onSubjectChange={setSubject}
          onNameBlur={() => {
            if (!name.trim()) setNameError(true);
          }}
          autoFocus
        />

        <SourceSections
          reviewerId={draftId}
          notes={notes}
          projectMaterial={projectMaterial}
          pastExamMaterial={pastExamMaterial}
          onNotesChange={setNotes}
          onProjectChange={setProjectMaterial}
          onPastExamChange={setPastExamMaterial}
        />

        <FormatPicker
          learn={learn}
          formats={formats}
          format={resolveFromList(formats, examFormatId)}
          onSelectSaved={selectSavedFormat}
          onSelectLearn={selectLearn}
          learnPanel={
            <GeneratedFormatPanel
              reviewerId={draftId}
              notes={notes}
              pastExam={pastExamMaterial}
              subject={subject || name}
              types={genTypes}
              counts={countByType}
              onChange={(types, counts) => {
                setGenTypes(types);
                setCountByType(counts);
                setGenSaved(false);
                setError("");
              }}
              formatName={genName}
              defaultName={genDefaultName}
              onNameChange={(v) => {
                setGenName(v);
                setGenSaved(false);
              }}
              onSave={saveGenerated}
              saved={genSaved}
            />
          }
        />

        <QuestionCountSection
          learn={learn}
          learnPending={learnPending}
          total={total}
          format={format}
          value={countByType}
          onChange={setCountByType}
          countError={countError}
        />

        <TopicsField topicList={topicList} />

        {/* Spacer so the fixed bar never hides the last field. */}
        <div aria-hidden="true" className="h-20" />

        {/* Fixed, same offset as the Format builder bar: above the mobile
            bottom bar, flush to the bottom from md up. */}
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 md:bottom-0">
          <div className="mx-auto w-full max-w-4xl px-6 pb-3 md:pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-menu">
              <span className="min-w-0 text-[0.875rem]">
                <span className="font-semibold text-text-primary">
                  {total} question{total === 1 ? "" : "s"}
                </span>
                {barError && (
                  <span role="alert" className="ml-2 text-error">
                    {barError}
                  </span>
                )}
              </span>
              <button
                type="submit"
                className="min-h-11 shrink-0 rounded-lg bg-accent px-4 py-2.5 text-[0.9375rem] font-medium text-on-accent hover:bg-accent-hover"
              >
                Create Reviewer
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
