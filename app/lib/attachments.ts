import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { newId } from "@/app/lib/ids";

// PDFs and images stay as-is (native vision on both providers — text,
// diagrams, charts, photos) instead of being flattened to extracted text.
// Kept in IndexedDB, not localStorage: raw file bytes are far bigger than
// localStorage's ~5-10MB quota allows for, especially with many files per
// Reviewer. Deliberately NOT part of the `Reviewer` type/export-import —
// attachments are local-only and never leave the browser via Export/Import
// JSON.

export type AttachmentField = "notes" | "project" | "pastexam";

// Extensionless or OS-mislabeled files arrive with an empty mimeType —
// guessing from the extension beats mislabeling everything application/pdf,
// which the server's byte-sniff then rejects after upload.
function inferMimeType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".txt") || lower.endsWith(".cpp")) return "text/plain";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "application/pdf";
}
export type Attachment = {
  id: string;
  reviewerId: string;
  field: AttachmentField;
  name: string;
  mimeType: string;
  data: ArrayBuffer;
  addedAt: string;
};

// A format's own sample past exam, stored as files beside the text kept on
// the format record. Separate store from reviewer attachments: keyed by
// format id, no field (past-exam files always generate with the "pastexam"
// source), same local-only rule — never part of Export/Import.
export type FormatAttachment = {
  id: string;
  formatId: string;
  name: string;
  mimeType: string;
  data: ArrayBuffer;
  addedAt: string;
};

interface AttachmentsDB extends DBSchema {
  attachments: {
    key: string;
    value: Attachment;
    indexes: { "by-reviewer": string };
  };
  "format-attachments": {
    key: string;
    value: FormatAttachment;
    indexes: { "by-format": string };
  };
}

// Lazily opened — `indexedDB` doesn't exist during SSR, and this module gets
// pulled into the render tree of a page that's server-rendered first.
let dbPromise: Promise<IDBPDatabase<AttachmentsDB>> | undefined;

function getDb(): Promise<IDBPDatabase<AttachmentsDB>> {
  if (!dbPromise) {
    // Version 2 adds the format-attachments store; the v1 reviewer store is
    // left exactly as it was, so existing attachments survive the upgrade.
    dbPromise = openDB<AttachmentsDB>("mayreviewer-attachments", 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("attachments")) {
          const store = db.createObjectStore("attachments", { keyPath: "id" });
          store.createIndex("by-reviewer", "reviewerId");
        }
        if (!db.objectStoreNames.contains("format-attachments")) {
          const formats = db.createObjectStore("format-attachments", { keyPath: "id" });
          formats.createIndex("by-format", "formatId");
        }
      },
      // A v1→v2 upgrade with another tab open blocks indefinitely otherwise —
      // surfacing it beats a silent hang.
      blocked() {
        console.warn("May Reviewer: attachment database upgrade blocked by another open tab. Close other tabs and reload.");
      },
    });
  }
  return dbPromise;
}

export async function getAttachments(
  reviewerId: string,
  field?: AttachmentField,
): Promise<Attachment[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex("attachments", "by-reviewer", reviewerId);
  return field ? all.filter((a) => a.field === field) : all;
}

export async function addAttachment(
  reviewerId: string,
  field: AttachmentField,
  file: File,
): Promise<Attachment> {
  const db = await getDb();
  let data: ArrayBuffer;
  try {
    data = await file.arrayBuffer();
  } catch {
    throw new Error(`Couldn't read "${file.name}" — the file may be locked or corrupted.`);
  }
  const attachment: Attachment = {
    id: newId(),
    reviewerId,
    field,
    name: file.name,
    mimeType: file.type || inferMimeType(file.name),
    data,
    addedAt: new Date().toISOString(),
  };
  try {
    await db.put("attachments", attachment);
  } catch {
    throw new Error("Couldn't save that file — browser storage may be full.");
  }
  return attachment;
}

export async function removeAttachment(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("attachments", id);
}

export async function deleteAttachmentsForReviewer(reviewerId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("attachments", "readwrite");
  const index = tx.store.index("by-reviewer");
  for await (const cursor of index.iterate(reviewerId)) {
    cursor.delete();
  }
  await tx.done;
}

export async function getFormatAttachments(formatId: string): Promise<FormatAttachment[]> {
  const db = await getDb();
  return db.getAllFromIndex("format-attachments", "by-format", formatId);
}

export async function addFormatAttachment(formatId: string, file: File): Promise<FormatAttachment> {
  const db = await getDb();
  let data: ArrayBuffer;
  try {
    data = await file.arrayBuffer();
  } catch {
    throw new Error(`Couldn't read "${file.name}" — the file may be locked or corrupted.`);
  }
  const attachment: FormatAttachment = {
    id: newId(),
    formatId,
    name: file.name,
    mimeType: file.type || inferMimeType(file.name),
    data,
    addedAt: new Date().toISOString(),
  };
  try {
    await db.put("format-attachments", attachment);
  } catch {
    throw new Error("Couldn't save that file — browser storage may be full.");
  }
  return attachment;
}

export async function removeFormatAttachment(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("format-attachments", id);
}

export async function deleteFormatAttachments(formatId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("format-attachments", "readwrite");
  const index = tx.store.index("by-format");
  for await (const cursor of index.iterate(formatId)) {
    cursor.delete();
  }
  await tx.done;
}

// Copies a format's past-exam files under a new id (used when cloning: the
// record clone alone would leave the copy generating from text only, with no
// indication its files stayed behind).
export async function cloneFormatAttachments(sourceId: string, targetId: string): Promise<void> {
  const db = await getDb();
  const source = await db.getAllFromIndex("format-attachments", "by-format", sourceId);
  // Guarded: cloning doubles stored bytes, and a mid-clone quota failure
  // would otherwise leave a half-cloned format behind.
  const totalBytes = source.reduce((sum, a) => sum + a.data.byteLength, 0);
  if (source.length > 10 || totalBytes > 40 * 1024 * 1024) {
    throw new Error("That format's files are too large to clone — re-attach them instead.");
  }
  try {
    for (const a of source) {
      await db.put("format-attachments", {
        ...a,
        id: newId(),
        formatId: targetId,
        addedAt: new Date().toISOString(),
      });
    }
  } catch {
    // Roll back the partial copy so the clone never points at half its files.
    await deleteFormatAttachments(targetId).catch(() => {});
    throw new Error("Couldn't clone those files — browser storage may be full.");
  }
}
