// Route-level: files uploaded to Gemini and to Mistral for the fallback are
// deleted when the stream ends, whether it finishes or the client cancels.
// Mistral keeps uploaded files until they are deleted, and the privacy page
// says attachments are only passed through.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mistralDeletes: string[] = [];
const geminiDeletes: string[] = [];
// Set by a test to hold the Mistral answer until it is released.
let mistralAnswer: () => Promise<void> = async () => {};
let mistralCalls = 0;

vi.mock("@google/genai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/genai")>();
  class GoogleGenAI {
    models = {
      // Not retryable, so every chunk goes straight to the fallback.
      generateContent: async () => {
        throw new Error("Gemini is down");
      },
    };
    files = {
      delete: async ({ name }: { name: string }) => {
        geminiDeletes.push(name);
        return {};
      },
    };
  }
  return { ...actual, GoogleGenAI };
});

vi.mock("@mistralai/mistralai", () => {
  class Mistral {
    files = {
      upload: async () => ({ id: "mistral-file-1" }),
      delete: async ({ fileId }: { fileId: string }) => {
        mistralDeletes.push(fileId);
        return { id: fileId, deleted: true };
      },
    };
    chat = {
      complete: async () => {
        mistralCalls++;
        await mistralAnswer();
        return {
          choices: [{ message: { content: JSON.stringify({ questions: [], sets: [] }) } }],
        };
      },
    };
  }
  return { Mistral };
});

vi.mock("@vercel/blob", () => ({ del: async () => undefined }));

// Skips the Blob fetch and the Gemini File API upload.
vi.mock("@/app/api/lib/attachments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/api/lib/attachments")>();
  return {
    ...actual,
    parseAttachments: async () => ({
      attachments: [
        {
          name: "notes.pdf",
          mimeType: "application/pdf",
          data: new Uint8Array([37, 80, 68, 70]),
          field: "notes",
          blobUrl: "https://example.public.blob.vercel-storage.com/attachments/notes.pdf",
        },
      ],
    }),
    activateFiles: async () => ({
      files: [{ uri: "https://gemini/files/1", mimeType: "application/pdf", name: "files/1" }],
    }),
  };
});

import { POST } from "@/app/api/generate/route";

function generate(signal?: AbortSignal) {
  return POST(
    new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attachments: [{}], count: 4, types: ["scenario"] }),
      signal,
    }),
  );
}

beforeEach(() => {
  mistralDeletes.length = 0;
  geminiDeletes.length = 0;
  mistralAnswer = async () => {};
  mistralCalls = 0;
  process.env.GEMINI_API_KEY = "test-key";
  process.env.MISTRAL_API_KEY = "test-key";
});

describe("Mistral fallback uploads", () => {
  it("are deleted when the stream finishes", async () => {
    const res = await generate();
    const lines = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));

    expect(lines.some((l) => l.type === "done")).toBe(true);
    // Uploaded once for all chunks, deleted once.
    expect(mistralDeletes).toEqual(["mistral-file-1"]);
    expect(geminiDeletes).toEqual(["files/1"]);
  });
});

describe("a cancelled generation", () => {
  // The run is held inside the Mistral call, after both uploads.
  function holdMistral() {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    mistralAnswer = () => held;
    return () => release();
  }

  it("deletes its uploaded files without waiting for the run to end", async () => {
    const release = holdMistral();
    const abort = new AbortController();
    await generate(abort.signal);
    await vi.waitFor(() => expect(mistralCalls).toBeGreaterThan(0));

    abort.abort();

    await vi.waitFor(() => {
      expect(geminiDeletes).toEqual(["files/1"]);
      expect(mistralDeletes).toEqual(["mistral-file-1"]);
    });
    release();
  });

  it("deletes each file once when the run still ends after the abort", async () => {
    const release = holdMistral();
    const abort = new AbortController();
    await generate(abort.signal);
    await vi.waitFor(() => expect(mistralCalls).toBeGreaterThan(0));

    abort.abort();
    await vi.waitFor(() => expect(mistralDeletes).toHaveLength(1));
    // The run goes on to its own end-of-stream cleanup.
    release();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(geminiDeletes).toEqual(["files/1"]);
    expect(mistralDeletes).toEqual(["mistral-file-1"]);
  });
});
