// Shared between the Blob upload token route and the generate route so a file
// the former accepts can never be one the latter then rejects.
export const PDF_MIME = "application/pdf";
export const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];
export const ALLOWED_ATTACHMENT_MIME_TYPES = [PDF_MIME, ...IMAGE_MIMES];
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

export type SniffedKind = "pdf" | "image" | "heic" | "unknown";

// Byte-signature check, because the declared mimeType is just a caller claim.
// Pure function so the unit tests can pin the signatures directly.
export function sniffAttachmentKind(data: Uint8Array): SniffedKind {
  const pdf = [0x25, 0x50, 0x44, 0x46]; // %PDF-
  if (pdf.every((b, i) => data[i] === b)) return "pdf";
  const jpeg = [0xff, 0xd8, 0xff];
  if (jpeg.every((b, i) => data[i] === b)) return "image";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((b, i) => data[i] === b)) return "image";
  // WebP: "RIFF" + 4 size bytes + "WEBP".
  if (
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  )
    return "image";
  // HEIC: "ftyp" box with an HEIC-family brand. Rejected with guidance, not
  // silently — iPhone photos default to this and the user should know why.
  const brands = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"];
  if (
    data[4] === 0x66 &&
    data[5] === 0x74 &&
    data[6] === 0x79 &&
    data[7] === 0x70 &&
    brands.includes(
      String.fromCharCode(data[8] ?? 0, data[9] ?? 0, data[10] ?? 0, data[11] ?? 0),
    )
  )
    return "heic";
  return "unknown";
}

// Extensions the picker accepts. HEIC is deliberately absent (see above) —
// caught on add with a guidance message instead of a silent drop.
export const ACCEPTED_UPLOAD_EXTENSIONS = ".pdf,.jpg,.jpeg,.png,.webp,.docx,.txt,.cpp";

export function isHeicFile(name: string, mimeType: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".heic") ||
    lower.endsWith(".heif") ||
    mimeType === "image/heic" ||
    mimeType === "image/heif"
  );
}

export const HEIC_GUIDANCE =
  "HEIC photos aren't supported — switch your camera to JPEG or convert the photo first, then upload it again.";
