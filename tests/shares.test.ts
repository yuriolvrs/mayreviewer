import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  SHARE_CODE_ALPHABET,
  buildFormatSnapshot,
  buildReviewerSnapshot,
  addCountLabel,
  getMyShare,
  newShareCode,
  recordShareAdd,
  normalizeShareCode,
  validateSharedFormat,
  validateSharedReviewer,
} from "@/app/lib/shares";
import { validateProfileInput, formatHandle, saveProfile } from "@/app/lib/profile";
import type { Question, Reviewer } from "@/app/types";
import type { ExamFormat } from "@/app/lib/examFormats";

const upsert = vi.fn();
const rpc = vi.fn();
const maybeSingle = vi.fn();
vi.mock("@/app/lib/supabase", () => ({
  getSupabaseClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
    from: () => {
      const chain: Record<string, unknown> = { upsert, maybeSingle };
      chain.select = () => chain;
      chain.eq = () => chain;
      return chain;
    },
    rpc,
  }),
}));

const q: Question = {
  id: "q1",
  type: "identification",
  question: "What is a process?",
  options: ["A", "B", "C", "D"],
  correctIndex: 0,
  source: "notes",
  favorite: true,
};

const format: ExamFormat = {
  id: "custom-1",
  name: "Mine",
  description: "",
  types: [
    { key: "t1", label: "T", format: "mc", shape: "standalone", stimulus: "none", defaultCount: 3 },
  ],
  pastExam: { fileName: "x.pdf", text: "secret past exam", addedAt: "2026-01-01" },
};

const reviewer: Reviewer = {
  id: "r1",
  reviewerName: "OS",
  subject: "Operating Systems",
  topics: ["a"],
  notes: "PRIVATE NOTES",
  projectMaterial: "PRIVATE PROJECT",
  pastExamMaterial: "PRIVATE PAST",
  examFormatId: "custom-1",
  questionCount: 1,
  questionCountByType: { t1: 1 },
  questions: [q],
  createdAt: "",
  updatedAt: "",
  questionsGeneratedAt: "",
};

describe("snapshots", () => {
  it("strips material, favorite, and pastExam", () => {
    const snap = buildReviewerSnapshot(reviewer, format);
    const json = JSON.stringify(snap);
    expect(json).not.toContain("PRIVATE");
    expect(json).not.toContain("secret past exam");
    expect(json).not.toContain("favorite");
    expect(snap.format?.pastExam).toBeUndefined();
    expect(snap.questions).toHaveLength(1);
    expect(reviewer.questions[0].favorite).toBe(true);
  });

  it("omits format when none given", () => {
    expect("format" in buildReviewerSnapshot(reviewer)).toBe(false);
  });

  it("format snapshot drops pastExam", () => {
    expect("pastExam" in buildFormatSnapshot(format)).toBe(false);
  });
});

describe("share codes", () => {
  it("uses a 30-char alphabet without ambiguous chars", () => {
    expect(SHARE_CODE_ALPHABET).toHaveLength(30);
    expect(SHARE_CODE_ALPHABET).not.toMatch(/[01OILU]/);
  });

  it("mints 6-char codes from the alphabet", () => {
    for (let i = 0; i < 200; i++) {
      expect(newShareCode()).toMatch(/^[A-HJKMNP-TV-Z2-9]{6}$/);
    }
  });

  it("normalizes input", () => {
    expect(normalizeShareCode(" ab2-cd3 ")).toBe("AB2CD3");
    expect(normalizeShareCode("https://x.app/s/ab2cd3")).toBe("AB2CD3");
    expect(normalizeShareCode("AB2CD0")).toBeNull();
    expect(normalizeShareCode("ABC")).toBeNull();
    expect(normalizeShareCode("")).toBeNull();
  });
});

describe("validateProfileInput", () => {
  it("accepts valid and rejects bad input", () => {
    expect(validateProfileInput("Yuri", "ab12")).toBeNull();
    expect(validateProfileInput("  ", "ab12")).not.toBeNull();
    expect(validateProfileInput("x".repeat(33), "ab12")).not.toBeNull();
    expect(validateProfileInput("Yuri", "ab")).not.toBeNull();
    expect(validateProfileInput("Yuri", "ab_12")).not.toBeNull();
  });

  it("formats handles", () => {
    expect(formatHandle("Yuri", "ab12")).toBe("Yuri#ab12");
  });
});

describe("saveProfile", () => {
  beforeEach(() => upsert.mockReset());

  it("maps unique violation to taken", async () => {
    upsert.mockResolvedValue({ error: { code: "23505", message: "dup" } });
    expect(await saveProfile("Yuri", "ab12")).toEqual({ ok: false, taken: true });
  });

  it("returns ok on success", async () => {
    upsert.mockResolvedValue({ error: null });
    expect(await saveProfile("Yuri", "ab12")).toEqual({ ok: true });
  });

  it("does not hit the db on invalid input", async () => {
    const r = await saveProfile("", "ab12");
    expect(r.ok).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("validateShared*", () => {
  it("rejects junk", () => {
    for (const bad of [null, "x", 5, [], {}, { questions: [] }, { reviewerName: "a", questions: [{}] }]) {
      expect(validateSharedReviewer(bad)).toBeNull();
    }
    for (const bad of [null, "x", {}, { id: "a", name: "b", types: [] }]) {
      expect(validateSharedFormat(bad)).toBeNull();
    }
  });

  it("cleans a valid reviewer and drops extras", () => {
    const out = validateSharedReviewer({
      ...buildReviewerSnapshot(reviewer, format),
      notes: "leak",
      questions: [q],
      format,
    });
    expect(out).not.toBeNull();
    expect(JSON.stringify(out)).not.toContain("leak");
    expect(JSON.stringify(out)).not.toContain("secret past exam");
    expect(out?.questions[0].favorite).toBeUndefined();
    expect(out?.format?.id).toBe("custom-1");
  });

  it("accepts a valid format without pastExam", () => {
    const out = validateSharedFormat(format);
    expect(out?.name).toBe("Mine");
    expect(out && "pastExam" in out).toBe(false);
  });
});

describe("add count", () => {
  beforeEach(() => {
    rpc.mockReset();
    maybeSingle.mockReset();
  });

  it("maps add_count on an owner read", async () => {
    maybeSingle.mockResolvedValue({
      data: { code: "AB2CD3", kind: "reviewer", title: "T", updated_at: "x", owner_id: "u1", add_count: 3 },
      error: null,
    });
    const r = await getMyShare("reviewer", "r1");
    expect(r.ok && r.share?.addCount).toBe(3);
  });

  it("leaves addCount undefined when the column is absent", async () => {
    maybeSingle.mockResolvedValue({
      data: { code: "AB2CD3", kind: "reviewer", title: "T", updated_at: "x", owner_id: "u1" },
      error: null,
    });
    const r = await getMyShare("reviewer", "r1");
    expect(r.ok && r.share?.addCount).toBeUndefined();
  });

  it("recordShareAdd calls the rpc and swallows errors", async () => {
    rpc.mockResolvedValue({ error: { message: "nope" } });
    await expect(recordShareAdd("AB2CD3")).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("record_share_add", { p_code: "AB2CD3" });
    rpc.mockRejectedValue(new Error("boom"));
    await expect(recordShareAdd("AB2CD3")).resolves.toBeUndefined();
  });

  it("labels counts", () => {
    expect(addCountLabel(0)).toBe("Not added yet");
    expect(addCountLabel(1)).toBe("Added 1 time");
    expect(addCountLabel(5)).toBe("Added 5 times");
  });
});
