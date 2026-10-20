import { describe, expect, it } from "vitest";
import { materialHasNoCode, pdfText } from "@/app/lib/pdfText";

// Builds a one-page PDF by hand. Each line is one text-show operation.
function makePdf(lines: string[]): Uint8Array<ArrayBuffer> {
  const esc = (s: string) => s.replace(/[\\()]/g, (ch) => "\\" + ch);
  const body = lines.map((l, i) => `BT /F1 10 Tf 20 ${780 - i * 14} Td (${esc(l)}) Tj ET`).join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

const prose = makePdf([
  "The French Revolution began in 1789 when the Estates General met at Versailles.",
  "The Third Estate declared itself the National Assembly after being shut out of the hall.",
  "Round robin scheduling gives each process a time quantum and then moves it to the back of the queue.",
  "A process that blocks on input gives up the CPU before its quantum ends.",
]);

const cpp = makePdf([
  "#include <set>",
  "#include <iostream>",
  "int main() {",
  "  std::set<int> s;",
  "  return 0;",
  "}",
]);

const pdf = (data: Uint8Array) => ({ mimeType: "application/pdf", data });

describe("materialHasNoCode", () => {
  it("reads text from a PDF", async () => {
    expect(await pdfText(prose)).toContain("French Revolution");
  });

  it("is true for a prose PDF", async () => {
    expect(await materialHasNoCode(["notes about history"], [pdf(prose)])).toBe(true);
  });

  it("is false for a C++ PDF", async () => {
    expect(await materialHasNoCode([""], [pdf(cpp)])).toBe(false);
  });

  it("is false when the pasted text has code", async () => {
    const code = "#include <set>\nint main() {\n  return 0;\n}";
    expect(await materialHasNoCode([code], [pdf(prose)])).toBe(false);
  });

  it("is false when an image is attached", async () => {
    const image = { mimeType: "image/png", data: new Uint8Array([1, 2, 3]) };
    expect(await materialHasNoCode([""], [pdf(prose), image])).toBe(false);
  });

  it("is false for a PDF with too little text", async () => {
    expect(await materialHasNoCode([""], [pdf(makePdf(["Slide 1"]))])).toBe(false);
  });

  it("returns null and false for garbage bytes", async () => {
    const junk = new Uint8Array([1, 2, 3, 4, 5]);
    expect(await pdfText(junk)).toBeNull();
    expect(await materialHasNoCode([""], [pdf(junk)])).toBe(false);
  });

  it("is true with no attachments and no code in the text", async () => {
    expect(await materialHasNoCode(["plain notes"], [])).toBe(true);
  });

  it("leaves the original bytes intact", async () => {
    const data = makePdf(["hello"]);
    const length = data.byteLength;
    await pdfText(data);
    await materialHasNoCode([""], [pdf(data)]);
    expect(data.byteLength).toBe(length);
  });
});
