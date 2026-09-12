// Client-side text extraction for uploaded DOCX/TXT notes. PDFs are handled
// separately (see app/lib/attachments.ts) — they're kept as PDFs and sent
// directly to Gemini at generation time, since Gemini has native PDF vision
// (diagrams/charts/images), which flattening to text would throw away.

// A malicious or accidental giant file (zip-bomb DOCX, huge log dump) would
// otherwise freeze the tab in mammoth or blow the save quota downstream.
export const MAX_EXTRACT_BYTES = 15 * 1024 * 1024;

async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (file.size > MAX_EXTRACT_BYTES) {
    throw new Error(`"${file.name}" is too large to read as text (limit 15MB).`);
  }

  if (
    name.endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return extractDocxText(file);
  }
  if (name.endsWith(".txt") || name.endsWith(".cpp") || file.type === "text/plain") {
    return file.text();
  }

  throw new Error(`Unsupported file type: ${file.name}`);
}
