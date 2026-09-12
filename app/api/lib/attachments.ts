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
import { clampToLine, stripSpoofingControls } from "@/app/lib/promptSafety";
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
      // SDK errors often carry status/code with a generic message — check
      // those as well as the text.
      const status = (err as { status?: unknown })?.status;
      const code = (err as { code?: unknown })?.code;
      const message = err instanceof Error ? err.message : String(err);
      const retryable = /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|deadline|rate.?limit|overloaded/i.test(
        `${message} ${String(status ?? "")} ${String(code ?? "")}`,
      );
      if (!retryable) throw err;
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

    // Reject before buffering: fetching 150MB to enforce a 40MB total cap
    // wastes time and memory when the header already says it's too big.
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_ATTACHMENT_BYTES) {
      return { error: `"${clampToLine(name, 60)}" is larger than ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB.` };
    }

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
  // Validated entries, in order — validation (no I/O) completes for the
  // whole batch before the first fetch starts.
  const validated: { name: string; mimeType: string; url: string; field: QuestionSource }[] = [];

  // Blobs fetched before a later entry fails validation would otherwise be
  // orphaned — the caller only learns blob URLs on success, so cleanup of a
  // failed batch happens here, not at the call site.
  async function fail(error: string, currentUrl?: string): Promise<{ error: string }> {
    const urls = [...attachments.map((a) => a.blobUrl), ...(currentUrl ? [currentUrl] : [])];
    await Promise.all(urls.map((u) => del(u).catch(() => {})));
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
    // server-side fetch of an attacker-supplied URL (SSRF). Our relays always
    // upload under `attachments/` (generation) or `past-exam/` (inference),
    // so anything outside those paths wasn't minted by us even if it lives
    // on a Vercel store.
    if (!isAllowedAttachmentUrl(url)) {
      return fail("Attachment has an invalid file URL.");
    }
    try {
      const pathname = new URL(url).pathname;
      if (!pathname.startsWith("/attachments/") && !pathname.startsWith("/past-exam/")) {
        return fail("Attachment has an invalid file URL.");
      }
    } catch {
      return fail("Attachment has an invalid file URL.");
    }
    validated.push({ name, mimeType, url, field });
  }

  // Fetched with bounded concurrency: sequential fetches (10 × 30s timeout)
  // would blow the route's own 60s budget before generation even starts.
  // Order is preserved by index, so the total-size accounting below still
  // rejects in entry order.
  const fetched: ({ data: Uint8Array<ArrayBuffer> } | { error: string })[] = new Array(validated.length);
  let next = 0;
  async function fetchWorker() {
    while (next < validated.length) {
      const i = next++;
      fetched[i] = await fetchAttachment(validated[i].url, validated[i].name);
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, validated.length) }, fetchWorker));

  for (let i = 0; i < validated.length; i++) {
    const { name, mimeType, url, field } = validated[i];
    const result = fetched[i];
    if ("error" in result) return fail(result.error, url);

    totalBytes += result.data.byteLength;
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      return fail(
        `Files total more than ${MAX_TOTAL_ATTACHMENT_BYTES / 1024 / 1024}MB — remove some and try again.`,
        url,
      );
    }

    // The name is echoed back to the client as a progress label and sent to
    // Gemini as a displayName; neither is a prompt slot, but an unbounded
    // filename has no legitimate use. Spoofing controls are stripped so the
    // human-visible name matches what the model reads.
    attachments.push({
      name: stripSpoofingControls(clampToLine(name, MAX_FILENAME_CHARS)) || "Untitled file",
      mimeType,
      data: result.data,
      field,
      blobUrl: url,
    });
  }

  return { attachments };
}

export type ActivatedFile = { uri: string; mimeType: string; name?: string };

// Best-effort delete of Gemini File API uploads after a run — they were a
// relay past the request size limit, and leaving them piles up File API
// storage. Never throws: cleanup must not fail a finished generation.
export async function deleteGeminiFiles(ai: GoogleGenAI, files: ActivatedFile[]): Promise<void> {
  await Promise.all(
    files
      .filter((f) => f.name)
      .map((f) => ai.files.delete({ name: f.name as string }).catch(() => {})),
  );
}

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
    files.push({ uri: file.uri, mimeType: file.mimeType, name: file.name ?? undefined });
  }
  return { files };
}
