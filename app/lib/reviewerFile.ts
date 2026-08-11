import { unzipSync, strFromU8 } from "fflate";
import {
  DEFAULT_QUESTION_COUNT,
  MAX_QUESTION_COUNT,
  MIN_QUESTION_COUNT,
  QUESTION_TYPES,
  isQuestion,
} from "@/app/lib/questions";
import type { AttachmentField } from "@/app/lib/attachments";
import type { Question, QuestionType } from "@/app/types";

export type AttachmentManifestEntry = {
  id: string;
  field: AttachmentField;
  name: string;
  mimeType: string;
  path: string;
};

function isAttachmentManifestEntry(value: unknown): value is AttachmentManifestEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    (v.field === "notes" || v.field === "project") &&
    typeof v.name === "string" &&
    typeof v.mimeType === "string" &&
    typeof v.path === "string"
  );
}

export type ParsedAttachment = AttachmentManifestEntry & { data: Uint8Array };

export type ParsedReviewerFile = {
  fileName: string;
  isArchive: boolean;
  reviewerName: string;
  subject: string;
  topics: string[];
  notes: string;
  projectMaterial: string;
  questionCount: number;
  questionCountByType?: Record<QuestionType, number>;
  questions: Question[];
  attachments: ParsedAttachment[];
};

// Reads and shape-checks a .json or .zip Reviewer export. Shared by the
// per-Reviewer Import/Export tab (merges into an existing Reviewer) and the
// New Reviewer screen's "import instead" path (creates a fresh one from it) —
// both need the identical parse, just do different things with the result.
export async function parseReviewerFile(
  file: File,
): Promise<{ ok: true; data: ParsedReviewerFile } | { ok: false; error: string }> {
  const isArchive = file.name.toLowerCase().endsWith(".zip");
  let reviewerJsonText: string;
  let zipEntries: Record<string, Uint8Array> | null = null;

  if (isArchive) {
    try {
      zipEntries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    } catch {
      return { ok: false, error: "Couldn't read that file as a valid .zip archive." };
    }
    const reviewerEntry = zipEntries["reviewer.json"];
    if (!reviewerEntry) {
      return { ok: false, error: "That archive doesn't contain a reviewer.json." };
    }
    reviewerJsonText = strFromU8(reviewerEntry);
  } else {
    reviewerJsonText = await file.text();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(reviewerJsonText);
  } catch {
    return { ok: false, error: "Couldn't parse that file as valid JSON." };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, error: "That file doesn't look like a valid Reviewer export." };
  }
  const obj = parsed as Record<string, unknown>;

  const questions = obj.questions;
  if (!Array.isArray(questions) || !questions.every(isQuestion)) {
    return { ok: false, error: "That file doesn't look like a valid Reviewer export." };
  }

  const questionCountRaw = obj.questionCount;
  const questionCount =
    typeof questionCountRaw === "number" &&
    Number.isInteger(questionCountRaw) &&
    questionCountRaw >= MIN_QUESTION_COUNT &&
    questionCountRaw <= MAX_QUESTION_COUNT
      ? questionCountRaw
      : DEFAULT_QUESTION_COUNT;

  // Only kept when it agrees with the total it's supposed to break down —
  // an inconsistent pair in a hand-edited file would otherwise steer
  // generation toward a mix the file never actually claimed.
  const byTypeRaw = obj.questionCountByType;
  const byType =
    typeof byTypeRaw === "object" && byTypeRaw !== null
      ? (byTypeRaw as Record<string, unknown>)
      : undefined;
  const questionCountByType =
    byType &&
    QUESTION_TYPES.every((t) => Number.isInteger(byType[t]) && (byType[t] as number) >= 0) &&
    QUESTION_TYPES.reduce((sum, t) => sum + (byType[t] as number), 0) === questionCount
      ? (Object.fromEntries(QUESTION_TYPES.map((t) => [t, byType[t] as number])) as Record<
          QuestionType,
          number
        >)
      : undefined;

  let attachments: ParsedAttachment[] = [];
  if (zipEntries) {
    const manifestRaw = obj.attachments;
    const manifest = Array.isArray(manifestRaw) ? manifestRaw.filter(isAttachmentManifestEntry) : [];
    const entries = zipEntries;
    attachments = manifest
      .filter((m) => entries[m.path])
      .map((m) => ({ ...m, data: entries[m.path] }));
  }

  return {
    ok: true,
    data: {
      fileName: file.name,
      isArchive,
      reviewerName: typeof obj.reviewerName === "string" ? obj.reviewerName : "",
      subject: typeof obj.subject === "string" ? obj.subject : "",
      topics: Array.isArray(obj.topics) ? obj.topics.filter((t): t is string => typeof t === "string") : [],
      notes: typeof obj.notes === "string" ? obj.notes : "",
      projectMaterial: typeof obj.projectMaterial === "string" ? obj.projectMaterial : "",
      questionCount,
      questionCountByType,
      questions,
      attachments,
    },
  };
}
