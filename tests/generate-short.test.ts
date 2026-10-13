// Route-level: a format with a short-answer type generates rubric questions,
// the schema carries `shortAnswers` only when needed, and the verify pass can
// drop but never "correct" a short answer.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { prompt: string; schema: Record<string, unknown> };
const calls: Call[] = [];
let respond: (call: Call) => unknown = () => ({});

vi.mock("@google/genai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/genai")>();
  class GoogleGenAI {
    models = {
      generateContent: async (args: {
        contents: unknown;
        config: { responseSchema: Record<string, unknown> };
      }) => {
        const call: Call = {
          prompt: JSON.stringify(args.contents),
          schema: args.config.responseSchema,
        };
        calls.push(call);
        return { text: JSON.stringify(respond(call)) };
      },
    };
    files = { delete: async () => ({}) };
  }
  return { ...actual, GoogleGenAI };
});

vi.mock("@vercel/blob", () => ({ del: async () => undefined }));

import { POST } from "@/app/api/generate/route";

const SHORT_FORMAT = {
  id: "recall-format",
  name: "Recall",
  description: "",
  types: [
    {
      key: "recall",
      label: "Recall",
      format: "short-answer",
      shape: "standalone",
      stimulus: "none",
      defaultCount: 3,
    },
  ],
};

function rubric(n: number, overrides: Record<string, unknown> = {}) {
  return {
    type: "recall",
    question: `Why does mechanism ${n} exist?`,
    modelAnswer: `Mechanism ${n} exists to isolate processes.`,
    keyPoints: [`Isolates process ${n}`, "Protects memory"],
    source: "notes",
    ...overrides,
  };
}

type ShortQuestion = {
  id: string;
  question: string;
  answerKind?: string;
  options: string[];
  correctIndex: number;
  keyPoints: string[];
};
type DoneMessage = {
  questions: ShortQuestion[];
  verified: { corrected: number; dropped: number };
};
type SchemaProps = Record<string, { items: { properties: { type: { enum: string[] } } } }>;

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
  return { res, done: lines.find((l) => l.type === "done") as DoneMessage | undefined };
}

beforeEach(() => {
  calls.length = 0;
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.MISTRAL_API_KEY;
  respond = () => ({});
});

describe("short-answer generation", () => {
  const body = {
    format: SHORT_FORMAT,
    notes: "Paging and segmentation notes.",
    count: 3,
    types: ["recall"],
    countByType: { recall: 3 },
  };

  it("returns rubric questions with no options and drops malformed ones", async () => {
    respond = (call) =>
      "shortAnswers" in (call.schema.properties as object)
        ? {
            questions: [],
            sets: [],
            shortAnswers: [
              rubric(1),
              rubric(2),
              rubric(3, { keyPoints: [] }),
              rubric(4, { type: "not-a-type" }),
              rubric(5),
            ],
          }
        : { results: [] };

    const { res, done } = await run(body);
    expect(res.status).toBe(200);
    expect(done).toBeDefined();

    const questions = done!.questions;
    expect(questions).toHaveLength(3);
    for (const q of questions) {
      expect(q.answerKind).toBe("short");
      expect(q.options).toEqual([]);
      expect(q.correctIndex).toBe(-1);
      expect(typeof q.id).toBe("string");
      expect(q.keyPoints.length).toBeGreaterThan(0);
    }
    expect(questions.map((q) => q.question)).not.toContain("Why does mechanism 3 exist?");
    expect(questions.map((q) => q.question)).not.toContain("Why does mechanism 4 exist?");
  });

  it("puts shortAnswers in the schema and a placeholder in the empty choice enum", async () => {
    respond = () => ({ questions: [], sets: [], shortAnswers: [rubric(1)], results: [] });
    await run({ ...body, count: 1, countByType: { recall: 1 } });

    const generation = calls[0];
    const props = generation.schema.properties as SchemaProps;
    expect(props.shortAnswers).toBeDefined();
    expect(props.shortAnswers.items.properties.type.enum).toEqual(["recall"]);
    expect(props.questions.items.properties.type.enum).toEqual(["none"]);
    expect(generation.schema.required).toEqual(["questions", "sets", "shortAnswers"]);
    expect(generation.prompt).toContain("shortAnswers");
    expect(generation.prompt).toContain("keyPoints");
  });

  it("never lets the verify pass change a short answer's key", async () => {
    respond = (call) => {
      const props = call.schema.properties as Record<string, unknown>;
      if ("shortAnswers" in props) {
        return { questions: [], sets: [], shortAnswers: [rubric(1), rubric(2)] };
      }
      // A "wrong" verdict is meaningless without options and must be ignored.
      return { results: [{ index: 0, verdict: "wrong", correctIndex: 2 }] };
    };

    const { done } = await run({ ...body, count: 2, countByType: { recall: 2 } });
    const questions = done!.questions;
    expect(questions).toHaveLength(2);
    expect(questions.every((q) => q.correctIndex === -1)).toBe(true);
    expect(done!.verified.corrected).toBe(0);
  });

  it("describes the rubric to the verifier instead of options", async () => {
    respond = (call) =>
      "shortAnswers" in (call.schema.properties as object)
        ? { questions: [], sets: [], shortAnswers: [rubric(1)] }
        : { results: [{ index: 0, verdict: "correct" }] };

    await run({ ...body, count: 1, countByType: { recall: 1 } });
    const verify = calls.find((c) => "results" in (c.schema.properties as object));
    expect(verify).toBeDefined();
    expect(verify!.prompt).toContain("Model answer:");
    expect(verify!.prompt).toContain("Key point 1:");
    expect(verify!.prompt).toContain("never \\\"wrong\\\" for these");
  });
});

describe("choice-only formats", () => {
  it("keep the original schema with no shortAnswers array", async () => {
    respond = () => ({ questions: [], sets: [] });
    await run({ notes: "Some notes about scheduling.", count: 4 });

    const generation = calls[0];
    const props = generation.schema.properties as Record<string, unknown>;
    expect("shortAnswers" in props).toBe(false);
    expect(generation.schema.required).toEqual(["questions", "sets"]);
    expect(generation.prompt).not.toContain("shortAnswers");
  });
});
