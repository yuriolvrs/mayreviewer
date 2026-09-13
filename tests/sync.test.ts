// @vitest-environment jsdom
// Merge functions are pure; tombstones + settings stamps use localStorage.
// The runSync block fakes the Supabase client to cover pull-merge-push.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuizAttempt, Reviewer } from "@/app/types";
import { LOCAL_CHANGE_EVENT } from "@/app/lib/localChange";
import {
  SYNC_APPLIED_EVENT,
  clearLocalSyncedData,
  getSyncMeta,
  mergeAttempts,
  mergeByUpdatedAt,
  mergeFormats,
  pickSettings,
  syncNow,
} from "@/app/lib/sync";
import { getCustomFormats, saveCustomFormat } from "@/app/lib/examFormats";
import {
  clearAllTombstones,
  clearTombstones,
  getTombstones,
  markDeleted,
} from "@/app/lib/tombstones";
import {
  DEFAULT_SETTINGS,
  getSettings,
  getSettingsUpdatedAt,
  replaceSettings,
  SETTINGS_CHANGED_EVENT,
  updateSettings,
} from "@/app/lib/settings";
import { getReviewers, getAllQuizHistory, replaceAllAttempts, replaceAllReviewers, saveReviewer } from "@/app/lib/storage";

const mockHolder = vi.hoisted(() => ({ client: null as unknown as SupabaseClient | null }));

vi.mock("@/app/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => mockHolder.client,
}));

function reviewer(id: string, updatedAt: string): Reviewer {
  return {
    id,
    reviewerName: id,
    subject: "",
    topics: [],
    notes: "",
    projectMaterial: "",
    pastExamMaterial: "",
    examFormatId: "csopesy-final",
    questionCount: 0,
    questionCountByType: {},
    questions: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
    questionsGeneratedAt: "2026-01-01T00:00:00.000Z",
  };
}

function attempt(id: string, reviewerId = "r1"): QuizAttempt {
  return {
    id,
    reviewerId,
    takenAt: "2026-01-02T00:00:00.000Z",
    score: 0,
    total: 0,
    questions: [],
    answers: {},
    unsureIds: [],
    questionSetGeneratedAt: "legacy",
    examFormatId: "csopesy-final",
    examFormatName: "CSOPESY Final",
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("mergeByUpdatedAt", () => {
  it("unions disjoint sets", () => {
    const merged = mergeByUpdatedAt(
      [reviewer("a", "2026-01-01T00:00:00.000Z")],
      [reviewer("b", "2026-01-01T00:00:00.000Z")],
    );
    expect(merged.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("later updatedAt wins in both directions", () => {
    const oldLocal = reviewer("a", "2026-01-01T00:00:00.000Z");
    const newCloud = { ...reviewer("a", "2026-02-01T00:00:00.000Z"), notes: "cloud" };
    expect(mergeByUpdatedAt([oldLocal], [newCloud])[0].notes).toBe("cloud");

    const newLocal = { ...reviewer("a", "2026-03-01T00:00:00.000Z"), notes: "local" };
    const oldCloud = reviewer("a", "2026-02-01T00:00:00.000Z");
    expect(mergeByUpdatedAt([newLocal], [oldCloud])[0].notes).toBe("local");
  });

  it("ties keep local so every device converges identically", () => {
    const stamp = "2026-01-01T00:00:00.000Z";
    const local = { ...reviewer("a", stamp), notes: "local" };
    const cloud = { ...reviewer("a", stamp), notes: "cloud" };
    expect(mergeByUpdatedAt([local], [cloud])[0].notes).toBe("local");
  });

  it("unparseable stamps lose to real ones", () => {
    const bad = reviewer("a", "not-a-date");
    const good = reviewer("a", "2026-01-01T00:00:00.000Z");
    expect(mergeByUpdatedAt([bad], [good])[0].updatedAt).toBe(good.updatedAt);
  });
});

describe("mergeAttempts", () => {
  it("unions by id without dropping either side", () => {
    const merged = mergeAttempts([attempt("a")], [attempt("b")]);
    expect(merged.map((a) => a.id).sort()).toEqual(["a", "b"]);
  });
});

describe("mergeFormats", () => {
  it("treats a missing stamp as epoch so any edit wins", () => {
    const local = { id: "f", name: "Local", description: "", types: [], updatedAt: "2026-01-01T00:00:00.000Z" };
    const cloud = { id: "f", name: "Cloud", description: "", types: [] };
    expect(mergeFormats([local], [cloud])[0].name).toBe("Local");
  });
});

describe("pickSettings", () => {
  it("keeps local when the cloud has no row yet", () => {
    const picked = pickSettings(DEFAULT_SETTINGS, "2026-01-01T00:00:00.000Z", null, null);
    expect(picked.fromCloud).toBe(false);
  });

  it("later stamp wins; ties and unstamped pairs keep local", () => {
    const cloud = { ...DEFAULT_SETTINGS, theme: "dark" as const };
    expect(
      pickSettings(DEFAULT_SETTINGS, "2026-02-01T00:00:00.000Z", cloud, "2026-01-01T00:00:00.000Z")
        .fromCloud,
    ).toBe(false);
    expect(
      pickSettings(DEFAULT_SETTINGS, "2026-01-01T00:00:00.000Z", cloud, "2026-02-01T00:00:00.000Z")
        .settings.theme,
    ).toBe("dark");
    expect(pickSettings(DEFAULT_SETTINGS, null, cloud, null).fromCloud).toBe(false);
  });
});

describe("tombstones", () => {
  it("marks, reads, and clears by collection", () => {
    markDeleted("reviewers", "r1");
    markDeleted("attempts", "a1");
    expect(getTombstones("reviewers")).toHaveProperty("r1");
    expect(getTombstones("formats")).toEqual({});
    clearTombstones("reviewers", ["r1"]);
    expect(getTombstones("reviewers")).toEqual({});
    expect(getTombstones("attempts")).toHaveProperty("a1");
    clearAllTombstones();
    expect(getTombstones("attempts")).toEqual({});
  });
});

describe("settings sync stamps", () => {
  it("updateSettings stamps the change time", () => {
    expect(getSettingsUpdatedAt()).toBeNull();
    updateSettings({ theme: "dark" });
    expect(getSettingsUpdatedAt()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("replaceSettings applies the cloud set verbatim and notifies", () => {
    const onChange = vi.fn();
    window.addEventListener(SETTINGS_CHANGED_EVENT, onChange);
    updateSettings({ theme: "dark" });
    replaceSettings({ ...DEFAULT_SETTINGS, theme: "light" }, "2026-05-01T00:00:00.000Z");
    expect(getSettings().theme).toBe("light");
    expect(getSettingsUpdatedAt()).toBe("2026-05-01T00:00:00.000Z");
    expect(onChange).toHaveBeenCalledTimes(1);
    window.removeEventListener(SETTINGS_CHANGED_EVENT, onChange);
  });
});

describe("local-change notifications", () => {
  it("user writes notify; sync bulk writers stay silent", () => {
    const onChange = vi.fn();
    window.addEventListener(LOCAL_CHANGE_EVENT, onChange);
    saveReviewer(reviewer("r1", "2026-01-01T00:00:00.000Z"));
    expect(onChange).toHaveBeenCalledTimes(1);
    updateSettings({ theme: "dark" });
    expect(onChange).toHaveBeenCalledTimes(2);
    // Sync's own writers must not echo: the data just came from a sync, and
    // notifying would schedule a pointless follow-up round-trip.
    replaceAllReviewers(getReviewers());
    replaceSettings(getSettings(), getSettingsUpdatedAt());
    expect(onChange).toHaveBeenCalledTimes(2);
    window.removeEventListener(LOCAL_CHANGE_EVENT, onChange);
  });
});

type FakeRow = { id: string; data: unknown; updated_at?: string; taken_at?: string };

// Minimal thenable query builder: just enough shape for runSync's
// select/eq, upsert, and delete/in/eq chains. Records writes for assertions.
function makeFakeCloud(state: {
  reviewers: FakeRow[];
  attempts: FakeRow[];
  formats: FakeRow[];
  settings: { data: unknown; updated_at: string } | null;
}) {
  const calls: { upserts: Record<string, unknown>; deletes: Record<string, string[]> } = {
    upserts: {},
    deletes: {},
  };
  const rowsFor = (table: string): FakeRow[] => {
    if (table === "reviewers") return state.reviewers;
    if (table === "attempts") return state.attempts;
    if (table === "formats") return state.formats;
    return [];
  };
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              const result =
                table === "settings"
                  ? { data: state.settings, error: null }
                  : { data: rowsFor(table), error: null };
              const p = Promise.resolve(result) as Promise<typeof result> & {
                maybeSingle: () => Promise<typeof result>;
              };
              p.maybeSingle = () => Promise.resolve(result);
              return p;
            },
          };
        },
        upsert(rows: unknown) {
          calls.upserts[table] = rows;
          return Promise.resolve({ error: null });
        },
        delete() {
          return {
            in(_col: string, ids: string[]) {
              return {
                eq() {
                  calls.deletes[table] = ids;
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

describe("runSync", () => {
  it("pull-merge-pushes the second-device scenario: cloud rows land locally and upload", async () => {
    // Browser A pushed this reviewer earlier; browser B signs in empty.
    const cloudReviewer = reviewer("from-cloud", "2026-03-01T00:00:00.000Z");
    const fake = makeFakeCloud({
      reviewers: [{ id: cloudReviewer.id, data: cloudReviewer, updated_at: cloudReviewer.updatedAt }],
      attempts: [],
      formats: [],
      settings: { data: { ...DEFAULT_SETTINGS, theme: "dark" }, updated_at: "2026-03-01T00:00:00.000Z" },
    });
    mockHolder.client = fake.client as unknown as SupabaseClient;
    const applied = vi.fn();
    window.addEventListener(SYNC_APPLIED_EVENT, applied);

    const result = await syncNow("user-1");

    expect(result.ok).toBe(true);
    expect(getReviewers().map((r) => r.id)).toContain("from-cloud");
    expect(getSettings().theme).toBe("dark");
    expect(applied).toHaveBeenCalledTimes(1);
    expect(getSyncMeta().lastSyncedAt).not.toBeNull();
    const pushed = fake.calls.upserts.reviewers as { id: string; user_id: string }[];
    expect(pushed.map((r) => r.id)).toContain("from-cloud");
    expect(pushed.every((r) => r.user_id === "user-1")).toBe(true);
    window.removeEventListener(SYNC_APPLIED_EVENT, applied);
  });

  it("pushes tombstoned ids as cloud deletes instead of resurrecting them", async () => {
    const gone = reviewer("gone", "2026-01-01T00:00:00.000Z");
    saveReviewer(gone);
    markDeleted("reviewers", "gone");
    // Drop the row the way deleteReviewer leaves it (tombstone kept).
    replaceAllReviewers([]);
    const fake = makeFakeCloud({
      reviewers: [{ id: "gone", data: gone, updated_at: gone.updatedAt }],
      attempts: [],
      formats: [],
      settings: null,
    });
    mockHolder.client = fake.client as unknown as SupabaseClient;

    const result = await syncNow("user-1");

    expect(result.ok).toBe(true);
    expect(fake.calls.deletes.reviewers).toEqual(["gone"]);
    expect(getTombstones("reviewers")).toEqual({});
    expect(getReviewers().map((r) => r.id)).not.toContain("gone");
  });

  it("drops local rows deleted on another device instead of re-pushing them", async () => {    // Key name lives in sync.ts (SYNC_META_KEY); the shape is asserted, not
    // the constant, so a rename surfaces here rather than silently passing.
    localStorage.setItem(
      "mayreviewer-sync-meta",
      JSON.stringify({ lastSyncedAt: "2026-05-01T00:00:00.000Z", lastError: null }),
    );
    saveReviewer(reviewer("deleted-elsewhere", "2026-04-01T00:00:00.000Z"));
    // saveReviewer stamps the real now (newer than the watermark, so "new").
    // Rewrite with the old stamp through the public bulk writer to simulate
    // a row that predates the last sync.
    replaceAllReviewers([reviewer("deleted-elsewhere", "2026-04-01T00:00:00.000Z")]);
    const fake = makeFakeCloud({ reviewers: [], attempts: [], formats: [], settings: null });
    mockHolder.client = fake.client as unknown as SupabaseClient;

    const result = await syncNow("user-1");

    expect(result.ok).toBe(true);
    expect(getReviewers()).toEqual([]);
    const pushed = fake.calls.upserts.reviewers as { id: string }[];
    expect(pushed).toEqual([]);
  });

  it("records whose data converged, for the account-switch guard", async () => {
    const fake = makeFakeCloud({ reviewers: [], attempts: [], formats: [], settings: null });
    mockHolder.client = fake.client as unknown as SupabaseClient;

    await syncNow("user-9");

    expect(getSyncMeta().lastUserId).toBe("user-9");
  });
});

describe("clearLocalSyncedData", () => {
  it("empties user stores, resets settings, and notifies screens", async () => {
    saveReviewer(reviewer("r1", "2026-01-01T00:00:00.000Z"));
    replaceAllAttempts([attempt("a1")]);
    saveCustomFormat({
      id: "f1",
      name: "Custom",
      description: "",
      types: [{ key: "t", label: "T", format: "mc", shape: "standalone", stimulus: "none", defaultCount: 1 }],
    });
    updateSettings({ theme: "dark" });
    markDeleted("reviewers", "old");
    const applied = vi.fn();
    window.addEventListener(SYNC_APPLIED_EVENT, applied);

    await clearLocalSyncedData();

    expect(getReviewers()).toEqual([]);
    expect(getAllQuizHistory()).toEqual([]);
    expect(getCustomFormats()).toEqual([]);
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(getTombstones("reviewers")).toEqual({});
    expect(applied).toHaveBeenCalledTimes(1);
    window.removeEventListener(SYNC_APPLIED_EVENT, applied);
  });
});
