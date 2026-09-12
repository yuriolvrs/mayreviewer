import { GoogleGenAI, FileState } from "@google/genai";
import { del } from "@vercel/blob";
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  HEIC_GUIDANCE,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_TOTAL_ATTACHMENT_BYTES,
  MAX_FILENAME_CHARS,
  isAllowedAttachmentUrl,
  sniffAttachmentKind,
} from "@/app/lib/attachmentLimits";
import { clampToLine } from "@/app/lib/promptSafety";
import type { QuestionSource } from "@/app/types";

// Server-only attachment intake, shared by /api/generate and /api/infer-format.
// Lives under app/api (never imported by client code). Moved verbatim out of
// the generate route so both routes validate, fetch, and activate files
// identically — a file one route accepts can never be one the other rejects.

export type IncomingAttachment = {
  name: string;
  mimeType: string;
  url: string;
  field: QuestionSource;
};

// Same shape after validation and fetching, with the bytes already in hand —
// fetching in the request handler means a malformed entry or an oversized
// blob is rejected before any Gemini call is made, rather than failing
// partway through. `blobUrl` is kept so the caller can delete it from Blob
// storage once it's no longer needed.
export type ParsedAttachment = {
  name: string;
  mimeType: string;
  data: Uint8Array<ArrayBuffer>;
  field: QuestionSource;
  blobUrl: string;
};

const ATTACHMENT_FETCH_TIMEOUT_MS = 30_000;
const FILE_PROCESSING_TIMEOUT_MS = 45_000;
const FILE_POLL_INTERVAL_MS = 1_000;

// Free-tier Gemini calls occasionally fail with a transient error (rate
// limiting or a dropped connection) even for a single small request — worth
// retrying before giving up on that source. Rate-limit errors get a longer
// backoff since they need real time to clear, not just a network retry.
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  const attempts = [0, 1500, 6000];
  let lastErr: unknown;
  for (let i = 0; i < attempts.length; i++) {
    if (attempts[i] > 0) await new Promise((resolve) => setTimeout(resolve, attempts[i]));
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      if (!/503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|deadline/i.test(message)) throw err;
    }
  }
  throw lastErr;
}

async function fetchAttachment(
  url: string,
  name: string,
): Promise<{ data: Uint8Array<ArrayBuffer> } | { error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ATTACHMENT_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return { error: `Couldn't fetch "${clampToLine(name, 60)}" (${response.status}).` };

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) return { error: `"${clampToLine(name, 60)}" is empty.` };
    if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
      return { error: `"${clampToLine(name, 60)}" is larger than ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB.` };
    }

    const data = new Uint8Array(buffer);
    // The declared mimeType is just a claim by the caller; check the bytes too
    // so the allowlist below can't be walked past with an arbitrary payload.
    // Images ride the same File API path as PDFs — both providers read them.
    const kind = sniffAttachmentKind(data);
    if (kind === "heic") {
      return { error: `"${clampToLine(name, 60)}" is HEIC. ${HEIC_GUIDANCE}` };
    }
    if (kind !== "pdf" && kind !== "image") {
      return { error: `"${clampToLine(name, 60)}" isn't a PDF or a supported image (JPG/PNG/WebP).` };
    }
    return { data };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    return { error: timedOut ? `Fetching "${clampToLine(name, 60)}" timed out.` : `Couldn't fetch "${clampToLine(name, 60)}".` };
  } finally {
    clearTimeout(timeout);
  }
}

export async function parseAttachments(
  raw: unknown,
): Promise<{ attachments: ParsedAttachment[] } | { error: string }> {
  if (raw === undefined) return { attachments: [] };
  if (!Array.isArray(raw)) return { error: "`attachments` must be an array." };
  if (raw.length > MAX_ATTACHMENTS) {
    return { error: `Too many files — ${MAX_ATTACHMENTS} at most per request.` };
  }

  const attachments: ParsedAttachment[] = [];
  let totalBytes = 0;

  // Blobs fetched before a later entry fails validation would otherwise be
  // orphaned — the caller only learns blob URLs on success, so cleanup of a
  // failed batch happens here, not at the call site.
  async function fail(error: string): Promise<{ error: string }> {
    await Promise.all(attachments.map((a) => del(a.blobUrl).catch(() => {})));
    return { error };
  }

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return fail("Malformed attachment.");
    const { name, mimeType, url, field } = entry as Record<string, unknown>;

    if (typeof name !== "string" || typeof mimeType !== "string" || typeof url !== "string") {
      return fail("Malformed attachment.");
    }
    if (field !== "notes" && field !== "project" && field !== "pastexam") {
      return fail("Attachment has an unrecognised field.");
    }
    if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(mimeType)) {
      return fail(`Unsupported file type "${clampToLine(mimeType, 60)}" — PDF, JPG, PNG, or WebP only.`);
    }
    // Only ever fetch our own Blob store's URLs — otherwise this is a
    // server-side fetch of an attacker-supplied URL (SSRF).
    if (!isAllowedAttachmentUrl(url)) {
      return fail("Attachment has an invalid file URL.");
    }

    const fetched = await fetchAttachment(url, name);
    if ("error" in fetched) return fail(fetched.error);

    totalBytes += fetched.data.byteLength;
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      return fail(`Files total more than ${MAX_TOTAL_ATTACHMENT_BYTES / 1024 / 1024}MB — remove some and try again.`);
    }

    // The name is echoed back to the client as a progress label and sent to
    // Gemini as a displayName; neither is a prompt slot, but an unbounded
    // filename has no legitimate use.
    attachments.push({
      name: clampToLine(name, MAX_FILENAME_CHARS) || "Untitled file",
      mimeType,
      data: fetched.data,
      field,
      blobUrl: url,
    });
  }

  return { attachments };
}

export type ActivatedFile = { uri: string; mimeType: string };

// Uploads parsed attachments to Gemini's File API and waits until each is
// ACTIVE and referenceable. One shared implementation so the generate and
// infer routes upload and poll identically.
export async function activateFiles(
  ai: GoogleGenAI,
  attachments: ParsedAttachment[],
): Promise<{ files: ActivatedFile[] } | { error: string }> {
  const files: ActivatedFile[] = [];
  for (const attachment of attachments) {
    let file;
    try {
      const blob = new Blob([attachment.data], { type: attachment.mimeType });
      file = await withRetry(() =>
        ai.files.upload({
          file: blob,
          config: { mimeType: attachment.mimeType, displayName: attachment.name },
        }),
      );
    } catch (err) {
      return { error: `Upload to Gemini failed: ${err instanceof Error ? err.message : String(err)}` };
    }

    const deadline = Date.now() + FILE_PROCESSING_TIMEOUT_MS;
    try {
      while (file.state === FileState.PROCESSING) {
        if (Date.now() > deadline || !file.name) {
          return { error: `Gemini took too long to process this file (>${FILE_PROCESSING_TIMEOUT_MS / 1000}s).` };
        }
        await new Promise((resolve) => setTimeout(resolve, FILE_POLL_INTERVAL_MS));
        file = await ai.files.get({ name: file.name });
      }
    } catch (err) {
      return { error: `Checking file status failed: ${err instanceof Error ? err.message : String(err)}` };
    }

    if (file.state === FileState.FAILED) {
      return { error: "Gemini rejected this file (couldn't process it as a valid file)." };
    }
    if (file.state !== FileState.ACTIVE || !file.uri || !file.mimeType) {
      return { error: `Gemini left this file in an unexpected state (${file.state ?? "unknown"}).` };
    }
    files.push({ uri: file.uri, mimeType: file.mimeType });
  }
  return { files };
}
