// Route-level: past exam is a style example only, short-answer key points do
// not restate the stem, and Code sets are skipped when the material has no code.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { prompt: string; schema: Record<string, unknown> };
const calls: Call[] = [];

vi.mock("@google/genai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/genai")>();
  class GoogleGenAI {
    models = {
      generateContent: async (args: {
        contents: unknown;
        config: { responseSchema: Record<string, unknown> };
      }) => {
        calls.push({ prompt: JSON.stringify(args.contents), schema: args.config.responseSchema });
        return { text: JSON.stringify({ questions: [], sets: [], shortAnswers: [], results: [] }) };
      },
    };
    files = { delete: async () => ({}) };
  }
  return { ...actual, GoogleGenAI };
});

vi.mock("@vercel/blob", () => ({ del: async () => undefined }));

import { POST } from "@/app/api/generate/route";

type DoneMessage = { questions: unknown[]; notices: string[] };

async function run(body: Record<string, unknown>) {
  const res = await POST(
    new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const text = await res.text();
  const lines = text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
  return { done: lines.find((l) => l.type === "done") as DoneMessage | undefined };
}

beforeEach(() => {
  calls.length = 0;
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.MISTRAL_API_KEY;
});

const allPrompts = () => calls.map((c) => c.prompt).join("\n");

const SHORT_FORMAT = {
  id: "recall-format",
  name: "Recall",
  description: "",
  types: [
    { key: "recall", label: "Recall", format: "short-answer", shape: "standalone", stimulus: "none", defaultCount: 3 },
  ],
};

describe("past exam as a style example", () => {
  it("tells the model not to copy the past exam", async () => {
    await run({
      format: SHORT_FORMAT,
      notes: "Some notes about paging.",
      pastExamMaterial: "1. What is paging?",
      count: 3,
      types: ["recall"],
      countByType: { recall: 3 },
    });
    const prompt = allPrompts();
    expect(prompt).toContain("style example");
    expect(prompt.toLowerCase()).toContain("do not copy");
    expect(prompt).not.toContain("reference that exam's format and facts");
  });
});

describe("short-answer key points", () => {
  it("must not restate what the stem already gives", async () => {
    await run({
      format: SHORT_FORMAT,
      notes: "Notes.",
      count: 3,
      types: ["recall"],
      countByType: { recall: 3 },
    });
    expect(allPrompts().toLowerCase()).toContain("never make a key point out of a fact the question itself already states");
  });
});

describe("Code questions without code", () => {
  const body = {
    types: ["identification", "code"],
    count: 8,
    countByType: { identification: 4, code: 4 },
  };

  it("skips Code, moves its count, and adds a notice when the material has no code", async () => {
    const { done } = await run({ ...body, notes: "Processes share the CPU using scheduling. FCFS; SJF are two policies." });
    const prompt = allPrompts();
    expect(prompt).not.toContain("CODE set (type");
    expect(prompt).toContain("Generate exactly 8 of these");
    // The mock writes nothing, so a shortfall notice may follow the Code one.
    expect(done!.notices.filter((n) => n.startsWith("Skipped"))).toHaveLength(1);
    expect(done!.notices[0]).toMatch(/code/i);
  });

  it("keeps Code when the notes contain a listing", async () => {
    const { done } = await run({
      ...body,
      notes: `#include <set>
int main() {
  std::set<int> s;
  s.insert(1);
  return 0;
}`,
    });
    expect(allPrompts()).toContain("CODE set (type");
    expect(done!.notices.filter((n) => n.startsWith("Skipped"))).toEqual([]);
  });
});
