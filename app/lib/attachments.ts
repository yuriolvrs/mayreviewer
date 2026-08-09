import { openDB, type DBSchema, type IDBPDatabase } from "idb";

// PDFs stay as PDFs (Gemini has native PDF vision — text, diagrams, charts,
// images) instead of being flattened to extracted text. Kept in IndexedDB,
// not localStorage: raw PDF bytes are far bigger than localStorage's ~5-10MB
// quota allows for, especially with many files per Reviewer. Deliberately
// NOT part of the `Reviewer` type/export-import — attachments are local-only
// and never leave the browser via Export/Import JSON.

export type AttachmentField = "notes" | "project";

export type Attachment = {
  id: string;
  reviewerId: string;
  field: AttachmentField;
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
}

// Lazily opened — `indexedDB` doesn't exist during SSR, and this module gets
// pulled into the render tree of a page that's server-rendered first.
let dbPromise: Promise<IDBPDatabase<AttachmentsDB>> | undefined;

function getDb(): Promise<IDBPDatabase<AttachmentsDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AttachmentsDB>("mayreviewer-attachments", 1, {
      upgrade(db) {
        const store = db.createObjectStore("attachments", { keyPath: "id" });
        store.createIndex("by-reviewer", "reviewerId");
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
  const attachment: Attachment = {
    id: crypto.randomUUID(),
    reviewerId,
    field,
    name: file.name,
    mimeType: file.type || "application/pdf",
    data: await file.arrayBuffer(),
    addedAt: new Date().toISOString(),
  };
  await db.put("attachments", attachment);
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
