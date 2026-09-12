import { unzipSync, strFromU8 } from "fflate";
import {
  DEFAULT_QUESTION_COUNT,
  MAX_QUESTION_COUNT,
  MIN_QUESTION_COUNT,
  isQuestion,
} from "@/app/lib/questions";
import type { AttachmentField } from "@/app/lib/attachments";
import { isValidFormatDef } from "@/app/lib/examFormats";
import type { ExamFormat } from "@/app/lib/examFormats";
import type { Question } from "@/app/types";

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
    // Past-exam files predate the field split — old exports carry them, so
    // they import rather than count as skipped.
    (v.field === "notes" || v.field === "project" || v.field === "pastexam") &&
    typeof v.name === "string" &&
    typeof v.mimeType === "string" &&
    typeof v.path === "string" &&
    MANIFEST_PATH_RE.test(v.path) &&
    !v.path.includes("..")
  );
}

export type ParsedAttachment = AttachmentManifestEntry & { data: Uint8Array };

// Zip-bomb guards: the whole archive is user bytes inflated in memory.
export const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_IMPORT_DECOMPRESSED_BYTES = 40 * 1024 * 1024;
export const MAX_IMPORT_JSON_CHARS = 5 * 1024 * 1024;
// Pasted-text fields are unbounded in older exports; cap them so one huge
// field can't crash the later saveReviewer write with a quota error.
export const MAX_IMPORT_TEXT_CHARS = 200_000;

// Zip entry paths are app-written (`files/<id>__<name>`). Anything else —
// absolute paths, `..`, nested folders — is rejected rather than trusted.
const MANIFEST_PATH_RE = /^files\/[A-Za-z0-9-]{1,80}__[^/\\]{1,180}$/;

export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/\.+$/g, "").trim();
  return cleaned.slice(0, 80) || "reviewer";
}

export type ParsedReviewerFile = {
  fileName: string;
  isArchive: boolean;
  reviewerName: string;
  subject: string;
  topics: string[];
  notes: string;
  projectMaterial: string;
  pastExamMaterial: string;
  questionCount: number;
  questionCountByType?: Record<string, number>;
  questions: Question[];
  attachments: ParsedAttachment[];
  // Manifest entries whose files are missing from the archive. Surfaced so
  // the import screen can warn instead of silently dropping them.
  skippedAttachments: number;
  // The format the reviewer was on, so its custom types travel with the
  // export instead of arriving as unknown keys. Validated structurally;
  // anything malformed is left out rather than failing the whole file.
  format?: ExamFormat;
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

  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return { ok: false, error: "That file is too large to import (limit 25MB)." };
  }

  if (isArchive) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Extension-only detection misroutes: a renamed .json would unzip-fail
    // confusingly, and a real zip with a wrong extension skips the archive
    // path. The PK magic decides.
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
      return { ok: false, error: "That file isn't a valid .zip archive." };
    }
    try {
      zipEntries = unzipSync(bytes);
    } catch {
      return { ok: false, error: "Couldn't read that file as a valid .zip archive." };
    }
    let decompressed = 0;
    for (const entry of Object.values(zipEntries)) {
      decompressed += entry.length;
      if (decompressed > MAX_IMPORT_DECOMPRESSED_BYTES) {
        return { ok: false, error: "That archive expands to more than 40MB — refusing to open it." };
      }
    }
    const reviewerEntry = zipEntries["reviewer.json"];
    if (!reviewerEntry) {
      return { ok: false, error: "That archive doesn't contain a reviewer.json." };
    }
    reviewerJsonText = strFromU8(reviewerEntry);
  } else {
    reviewerJsonText = await file.text();
  }
  if (reviewerJsonText.length > MAX_IMPORT_JSON_CHARS) {
    return { ok: false, error: "That reviewer file is too large to import (limit 5MB of JSON)." };
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
  // generation toward a mix the file never actually claimed. Keys are the
  // file's own (custom formats use opaque slugs), not the global type list —
  // a mismatch against the reviewer's format is resolved by normalize() on
  // read, which re-splits from the total.
  const byTypeRaw = obj.questionCountByType;
  const byType =
    typeof byTypeRaw === "object" && byTypeRaw !== null
      ? (byTypeRaw as Record<string, unknown>)
      : undefined;
  const entries = byType ? Object.entries(byType) : [];
  const questionCountByType =
    byType &&
    entries.length > 0 &&
    entries.every(
      ([key, n]) => key.length > 0 && Number.isInteger(n) && (n as number) >= 0,
    ) &&
    entries.reduce((sum, [, n]) => sum + (n as number), 0) === questionCount
      ? (Object.fromEntries(entries) as Record<string, number>)
      : undefined;

  let attachments: ParsedAttachment[] = [];  let skippedAttachments = 0;
  if (zipEntries) {
    const manifestRaw = obj.attachments;
    const manifest = Array.isArray(manifestRaw) ? manifestRaw.filter(isAttachmentManifestEntry) : [];
    skippedAttachments = Array.isArray(manifestRaw) ? manifestRaw.length - manifest.length : 0;
    const entries = zipEntries;
    attachments = manifest
      .filter((m) => entries[m.path])
      .map((m) => ({ ...m, data: entries[m.path] }));
    skippedAttachments += manifest.length - attachments.length;
  }

  return {
    ok: true,
    data: {
      fileName: file.name,
      isArchive,
      reviewerName: typeof obj.reviewerName === "string" ? obj.reviewerName : "",
      subject: typeof obj.subject === "string" ? obj.subject : "",
      topics: Array.isArray(obj.topics) ? obj.topics.filter((t): t is string => typeof t === "string") : [],
      notes: typeof obj.notes === "string" ? obj.notes.slice(0, MAX_IMPORT_TEXT_CHARS) : "",
      projectMaterial:
        typeof obj.projectMaterial === "string"
          ? obj.projectMaterial.slice(0, MAX_IMPORT_TEXT_CHARS)
          : "",
      pastExamMaterial:
        typeof obj.pastExamMaterial === "string"
          ? obj.pastExamMaterial.slice(0, MAX_IMPORT_TEXT_CHARS)
          : "",
      questionCount,
      questionCountByType,
      questions,
      attachments,
      skippedAttachments,
      ...(isValidFormatDef(obj.format) ? { format: obj.format } : {}),
    },
  };
}
