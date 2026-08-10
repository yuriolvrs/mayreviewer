// Shared between the Blob upload token route and the generate route so a file
// the former accepts can never be one the latter then rejects.
export const ALLOWED_ATTACHMENT_MIME_TYPES = ["application/pdf"];
export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 40 * 1024 * 1024;
export const MAX_FILENAME_CHARS = 200;

// Vercel Blob's public store domain — attachment URLs are fetched server-side
// in /api/generate, so this allowlist is what stops that fetch from being
// pointed at an arbitrary internal/external URL (SSRF) by a caller who skips
// the normal upload flow and posts a crafted `url` directly.
const BLOB_HOSTNAME_SUFFIX = ".public.blob.vercel-storage.com";

export function isAllowedAttachmentUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(BLOB_HOSTNAME_SUFFIX);
  } catch {
    return false;
  }
}
