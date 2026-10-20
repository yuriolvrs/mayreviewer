// Route-level: generation is split into small chunks that run together, the
// writing phase stops before the Function time limit, and a type that the
// answer check emptied is reported. Failure seen on Vercel: a 20-question run
// was one slow call, the platform killed it, and the client got no done frame.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
        return { text: JSON.stringify(await respond(call)) };
      },
    };
    files = { delete: async () => ({}) };
  }
  return { ...actual, GoogleGenAI };
});

vi.mock("@vercel/blob", () => ({ del: async () => undefined }));

import { POST } from "@/app/api/generate/route";

type DoneMessage = {
  questions: { question: string; type: string }[];
  notices: string[];
};

function start(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  ).then(async (res) => {
    const lines = (await res.text())
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    return lines.find((l) => l.type === "done") as DoneMessage | undefined;
  });
}

const OPTIONS = ["2.33 ms", "3.33 ms", "4.00 ms", "5.00 ms"];

function item(type: string, question: string) {
  return {
    type,
    question,
    options: OPTIONS,
    correctIndex: 1,
    explanation: "Waiting times are 0, 3 and 7, so the average is (0 + 3 + 7) / 3 = 3.33 ms.",
    whyOthersWrong: "The other values come from using burst times instead of start times.",
    source: "notes",
  };
}

// Different enough that the duplicate filter keeps all of them.
const STEMS = [
  "A printer spool receives three jobs at once; what is the mean delay?",
  "Which page replacement policy suffers from Belady's anomaly in this trace?",
  "Two threads increment one counter without a lock; what final values can appear?",
];

const isGeneration = (call: Call) => "questions" in (call.schema.properties as object);
const generationCalls = () => calls.filter(isGeneration);
const verifyAllCorrect = (n: number) => ({
  results: Array.from({ length: n }, (_, index) => ({ index, verdict: "correct" })),
});

beforeEach(() => {
  calls.length = 0;
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.MISTRAL_API_KEY;
});

afterEach(() => {
  vi.useRealTimers();
});

const twentyFromNotes = {
  notes: "CPU scheduling notes: FCFS, SJF, round robin.",
  count: 20,
  types: ["scenario"],
};

describe("writing phase is time bounded", () => {
  it("ships the chunks that finished and says time ran out", async () => {
    vi.useFakeTimers();
    let n = 0;
    respond = (call) => {
      if (!isGeneration(call)) return verifyAllCorrect(3);
      // First call answers at once. The second never answers.
      if (n++ === 0) {
        return {
          questions: STEMS.slice(0, 3).map((q) => item("scenario", q)),
          sets: [],
        };
      }
      return new Promise(() => {});
    };

    const pending = start(twentyFromNotes);
    await vi.advanceTimersByTimeAsync(60_000);
    const done = await pending;

    expect(done).toBeDefined();
    expect(done!.questions.length).toBeGreaterThan(0);
    expect(done!.questions.length).toBeLessThan(20);
    expect(done!.notices.some((m) => m.startsWith("Time ran out: only 3 of 20"))).toBe(true);
  });

  it("still sends a done frame when nothing finishes in time", async () => {
    vi.useFakeTimers();
    respond = (call) => (isGeneration(call) ? new Promise(() => {}) : verifyAllCorrect(0));

    const pending = start(twentyFromNotes);
    await vi.advanceTimersByTimeAsync(60_000);
    const done = await pending;

    expect(done).toBeDefined();
    expect(done!.questions).toHaveLength(0);
    expect(done!.notices.some((m) => m.startsWith("Time ran out: only 0 of 20"))).toBe(true);
  });
});

describe("chunks of one source", () => {
  it("are all requested before any of them answers", async () => {
    const release: (() => void)[] = [];
    let n = 0;
    respond = (call) => {
      if (!isGeneration(call)) return verifyAllCorrect(2);
      const mine = n++;
      return new Promise((resolve) => {
        release.push(() =>
          resolve({ questions: [item("scenario", STEMS[mine])], sets: [] }),
        );
      });
    };

    const pending = start(twentyFromNotes);
    await vi.waitFor(() => expect(generationCalls()).toHaveLength(2));
    // Neither call has resolved yet, and both are already in flight.
    expect(release).toHaveLength(2);
    release.forEach((fn) => fn());
    const done = await pending;
    expect(done!.questions).toHaveLength(2);
  });
});

describe("shortfall notice", () => {
  it("names a type the answer check emptied", async () => {
    let n = 0;
    respond = (call) => {
      if (isGeneration(call)) {
        // The first call writes the batch. Backfill finds nothing.
        return n++ === 0
          ? {
              questions: [
                item("identification", "Which scheduler picks the shortest burst first?"),
                item("identification", "Which scheduler gives each process a time slice?"),
                item("scenario", "Three jobs share one printer; what is the mean delay?"),
                item("scenario", "Two jobs arrive together; which one finishes first?"),
              ],
              sets: [],
            }
          : { questions: [], sets: [] };
      }
      // Indexes 0 and 1 are the two identification items.
      return {
        results: [
          { index: 0, verdict: "drop" },
          { index: 1, verdict: "drop" },
          { index: 2, verdict: "correct" },
          { index: 3, verdict: "correct" },
        ],
      };
    };

    const done = await start({
      notes: "CPU scheduling notes: FCFS, SJF, round robin.",
      count: 4,
      types: ["identification", "scenario"],
      countByType: { identification: 2, scenario: 2 },
    });

    expect(done).toBeDefined();
    expect(done!.questions.every((q) => q.type === "scenario")).toBe(true);
    expect(done!.notices).toContain("Fewer than asked: Identification 0 of 2.");
  });
});
