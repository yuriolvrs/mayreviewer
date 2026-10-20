import { extractText } from "unpdf";
import { PDF_MIME } from "@/app/lib/attachmentLimits";
import { looksLikeCode } from "@/app/lib/codeDetect";

// Less readable text than this means a scanned or image PDF, so we cannot tell.
const MIN_READABLE_CHARS = 200;

// Plain text of a PDF, or null when it cannot be read. pdf.js can detach the
// buffer it is given, and the caller still needs the bytes for the upload, so
// it gets a copy.
export async function pdfText(data: Uint8Array): Promise<string | null> {
  try {
    const { text } = await extractText(new Uint8Array(data), { mergePages: true });
    return text;
  } catch {
    return null;
  }
}

// True only when we are sure there is no code: the pasted texts have none and
// every attachment is a PDF with readable text that has none. Images and
// scanned PDFs are unknown, so they count as "may have code".
export async function materialHasNoCode(
  texts: string[],
  attachments: { mimeType: string; data: Uint8Array }[],
): Promise<boolean> {
  if (looksLikeCode(texts.join("\n"))) return false;
  if (attachments.some((a) => a.mimeType !== PDF_MIME)) return false;
  const extracted = await Promise.all(attachments.map((a) => pdfText(a.data)));
  return extracted.every(
    (text) => text !== null && text.replace(/\s/g, "").length >= MIN_READABLE_CHARS && !looksLikeCode(text),
  );
}
