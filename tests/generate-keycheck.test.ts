// Route-level: the answer check drops (and backfills) any item whose own
// explanation contradicts its key, even when the model verifier calls it
// "correct" or "fixes" it. Usability test issue 1: an FCFS item keyed 2.33
// with an explanation that computed 3.33 and said "Wait, calculating again…"
// shipped under a banner saying "fixed 1 wrong answer".
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

type DoneMessage = {
  questions: { question: string; correctIndex: number; groupId?: string }[];
  verified: { corrected: number; dropped: number };
};

async function run(body: Record<string, unknown>) {
  const res = await POST(
    new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const lines = (await res.text())
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
  return lines.find((l) => l.type === "done") as DoneMessage | undefined;
}

const OPTIONS = ["2.33 ms", "3.33 ms", "4.00 ms", "5.00 ms"];

function scenario(question: string, overrides: Record<string, unknown> = {}) {
  return {
    type: "scenario",
    question,
    options: OPTIONS,
    correctIndex: 1,
    explanation: "Waiting times are 0, 3 and 7, so the average is (0 + 3 + 7) / 3 = 3.33 ms.",
    whyOthersWrong: "The other values come from using burst times instead of start times.",
    source: "notes",
    ...overrides,
  };
}

const GOOD = "Three print jobs reach a shared printer spool together; what is their mean delay?";
const BAD = "Under FCFS with P1, P2, P3 bursts 3, 4, 3, what is the average waiting time?";

function isGeneration(call: Call) {
  return "questions" in (call.schema.properties as object);
}

beforeEach(() => {
  calls.length = 0;
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.MISTRAL_API_KEY;
});

const body = {
  notes: "CPU scheduling notes: FCFS, SJF, round robin.",
  count: 2,
  types: ["scenario"],
  countByType: { scenario: 2 },
};

describe("answer check rejects keys the explanation contradicts", () => {
  it("drops an item with self-correction scratch work even when the verifier says correct", async () => {
    respond = (call) =>
      isGeneration(call)
        ? {
            questions: [
              scenario(GOOD),
              scenario(BAD, {
                correctIndex: 0,
                explanation: "Average = 10/3 = 3.33. Wait, calculating again… Wait, checking calculation: 2.33.",
              }),
            ],
            sets: [],
          }
        : { results: [{ index: 0, verdict: "correct" }, { index: 1, verdict: "correct" }] };

    const done = await run(body);
    expect(done).toBeDefined();
    const stems = done!.questions.map((q) => q.question);
    expect(stems).toContain(GOOD);
    expect(stems).not.toContain(BAD);
    expect(done!.verified.dropped).toBeGreaterThan(0);
  });

  it("drops an item whose explanation's final value is not the keyed option", async () => {
    respond = (call) =>
      isGeneration(call)
        ? { questions: [scenario(GOOD), scenario(BAD, { correctIndex: 0 })], sets: [] }
        : { results: [{ index: 0, verdict: "correct" }, { index: 1, verdict: "correct" }] };

    const done = await run(body);
    const stems = done!.questions.map((q) => q.question);
    expect(stems).toContain(GOOD);
    expect(stems).not.toContain(BAD);
  });

  it("does not count a verifier 'fix' that contradicts the explanation as corrected", async () => {
    // Keyed B (3.33) and explained as 3.33; the verifier moves the key to A.
    respond = (call) =>
      isGeneration(call)
        ? { questions: [scenario(GOOD), scenario(BAD)], sets: [] }
        : { results: [{ index: 0, verdict: "correct" }, { index: 1, verdict: "wrong", correctIndex: 0 }] };

    const done = await run(body);
    const stems = done!.questions.map((q) => q.question);
    expect(stems).toContain(GOOD);
    expect(stems).not.toContain(BAD);
    expect(done!.verified.corrected).toBe(0);
  });

  it("keeps a consistent item and a consistent verifier fix", async () => {
    // Keyed A but explained as 3.33 (B); the verifier moves the key to B,
    // which now agrees with the explanation.
    respond = (call) =>
      isGeneration(call)
        ? { questions: [scenario(GOOD), scenario(BAD, { correctIndex: 0 })], sets: [] }
        : { results: [{ index: 0, verdict: "correct" }, { index: 1, verdict: "wrong", correctIndex: 1 }] };

    const done = await run(body);
    const fixed = done!.questions.find((q) => q.question === BAD);
    expect(fixed).toBeDefined();
    expect(fixed!.correctIndex).toBe(1);
    expect(done!.verified.corrected).toBe(1);
    expect(done!.verified.dropped).toBe(0);
  });

  it("drops a whole set when one of its members contradicts its key", async () => {
    const member = (n: number, overrides: Record<string, unknown> = {}) => ({
      question: `Blank ${n}: average waiting time?`,
      options: OPTIONS,
      correctIndex: 1,
      explanation: "The average is (0 + 3 + 7) / 3 = 3.33 ms.",
      whyOthersWrong: "The others use burst times.",
      ...overrides,
    });
    respond = (call) =>
      isGeneration(call)
        ? {
            questions: [],
            sets: [
              {
                type: "timeline",
                title: "FCFS trace",
                stimulus: "| P | Arrival | Burst |\n| P1 | 0 | 3 |\n| P2 | 0 | 4 |\n| P3 | 0 | 3 |",
                source: "notes",
                questions: [member(1), member(2, { explanation: "Wait, recalculating: 3.33 ms." }), member(3)],
              },
            ],
          }
        : { results: [] };

    const done = await run({
      notes: "CPU scheduling notes.",
      count: 3,
      types: ["timeline"],
      countByType: { timeline: 3 },
    });
    expect(done).toBeDefined();
    expect(done!.questions.filter((q) => q.question.startsWith("Blank "))).toHaveLength(0);
  });
});

describe("answer check simulates CPU-scheduling sets", () => {
  const stimulus = ["FCFS", "", "Process | AT | BT", "P1 | 0 | 5", "P2 | 1 | 3", "P3 | 2 | 2"].join("\n");
  const member = (question: string, options: string[], correctIndex: number) => ({
    question,
    options,
    correctIndex,
    explanation: "Follow the schedule in arrival order.",
    whyOthersWrong: "The others misread the order.",
  });
  const RUNNING = "Which process is running at time 7?";
  const setBody = (members: ReturnType<typeof member>[]) => ({
    questions: [],
    sets: [{ type: "timeline", title: "FCFS Scheduling", stimulus, source: "notes", questions: members }],
  });
  const request = { notes: "CPU scheduling notes.", count: 2, types: ["timeline"], countByType: { timeline: 2 } };
  type Full = DoneMessage["questions"][number] & { explanation?: string; whyOthersWrong?: string };

  it("corrects a wrong name key even when the verifier calls it correct", async () => {
    respond = (call) =>
      isGeneration(call)
        ? setBody([
            member(RUNNING, ["P1", "P2", "P3", "None"], 2),
            member("At what time does P1 complete?", ["5", "6", "8", "10"], 0),
          ])
        : { results: [{ index: 0, verdict: "correct" }, { index: 1, verdict: "correct" }] };

    const done = await run(request);
    const fixed = done!.questions.find((q) => q.question === RUNNING) as Full;
    expect(fixed.correctIndex).toBe(1);
    expect(fixed.explanation).toBe("Schedule: P1 0–5, P2 5–8, P3 8–10. At t = 7, P2 is running.");
    expect(fixed.whyOthersWrong).toBeUndefined();
    expect(done!.questions.find((q) => q.question.startsWith("At what"))!.correctIndex).toBe(0);
    expect(done!.verified.corrected).toBe(1);
  });

  it("overrides a wrong verifier correction", async () => {
    respond = (call) =>
      isGeneration(call)
        ? setBody([
            member(RUNNING, ["P1", "P2", "P3", "None"], 1),
            member("At what time does P1 complete?", ["5", "6", "8", "10"], 0),
          ])
        : { results: [{ index: 0, verdict: "wrong", correctIndex: 3 }, { index: 1, verdict: "correct" }] };

    const done = await run(request);
    expect(done!.questions.find((q) => q.question === RUNNING)!.correctIndex).toBe(1);
    expect(done!.verified.corrected).toBe(0);
  });

  it("drops the whole set when the computed answer matches no option", async () => {
    respond = (call) =>
      isGeneration(call)
        ? setBody([
            member(RUNNING, ["P1", "P3", "None", "P4"], 0),
            member("At what time does P1 complete?", ["5", "6", "8", "10"], 0),
          ])
        : { results: [] };

    const done = await run(request);
    expect(done!.questions.filter((q) => q.groupId)).toHaveLength(0);
  });
});

