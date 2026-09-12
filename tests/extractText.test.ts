import { describe, expect, it } from "vitest";
import { extractTextFromFile } from "@/app/lib/extractText";

describe("extractTextFromFile size guard", () => {
  it("rejects oversized files before parsing", async () => {
    const fake = {
      name: "huge.docx",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: 99 * 1024 * 1024,
      arrayBuffer: async () => {
        throw new Error("must not be called");
      },
    } as unknown as File;
    await expect(extractTextFromFile(fake)).rejects.toThrow(/too large/i);
  });

  it("reads small text files", async () => {
    const file = new File(["hello"], "n.txt", { type: "text/plain" });
    await expect(extractTextFromFile(file)).resolves.toBe("hello");
  });
});
