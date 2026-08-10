// Client-side text extraction for uploaded DOCX/TXT notes. PDFs are handled
// separately (see app/lib/attachments.ts) — they're kept as PDFs and sent
// directly to Gemini at generation time, since Gemini has native PDF vision
// (diagrams/charts/images), which flattening to text would throw away.

async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();

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
