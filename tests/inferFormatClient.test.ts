import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/blob/client", () => ({
  upload: vi.fn(async (path: string) => ({ url: `https://blob.test/${path}` })),
}));
vi.mock("@/app/lib/turnstileClient", () => ({
  fetchWithTurnstile: (url: string, init?: RequestInit) => fetch(url, init),
}));

import { inferFormat } from "@/app/lib/inferFormatClient";

afterEach(() => vi.unstubAllGlobals());

const file = { id: "f1", name: "notes.pdf", mimeType: "application/pdf", data: new ArrayBuffer(4) };

describe("inferFormat", () => {
  it("uploads files, posts to the API, and returns types", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ types: [{ label: "A" }], unsupported: [{ label: "B", reason: "r" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await inferFormat({ files: [file], text: "hi", subject: "", uploadPrefix: "p/x" });
    expect(out.types).toHaveLength(1);
    expect(out.unsupported).toHaveLength(1);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.attachments[0]).toMatchObject({ url: "https://blob.test/p/x/f1-notes.pdf", field: "pastexam" });
    expect(body.subject).toBeUndefined();
  });

  it("throws the server error message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Nope" }, { status: 422 })));
    await expect(inferFormat({ files: [], text: "x", uploadPrefix: "p" })).rejects.toThrow("Nope");
  });
});
