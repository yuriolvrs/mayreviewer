import type { ExamFormat } from "@/app/lib/examFormats";
import { getCustomFormats, isValidFormatDef } from "@/app/lib/examFormats";
import type { QuizAttempt, Reviewer, UserSettings } from "@/app/types";
import { DEFAULT_SETTINGS, getSettings, getSettingsUpdatedAt } from "@/app/lib/settings";
import {
  clearTombstones,
  getTombstones,
  type SyncCollection,
} from "@/app/lib/tombstones";
import { getAllQuizHistory, getReviewers } from "@/app/lib/storage";
import { getSupabaseClient } from "@/app/lib/supabase";

// Local-first sync. Reads and writes stay synchronous against localStorage
// (all components untouched); the cloud is converged in the background by
// pull-merge-push: pull every row, merge with local by updatedAt
// last-write-wins, write the merged set locally, push it back up. Ids are
// client-generated (newId), so inserts never collide across devices.
//
// Deletes travel via tombstones (app/lib/tombstones.ts): ids deleted locally
// are deleted from the cloud on push; ids that vanish from the cloud since
// the last sync were deleted on another device and drop locally (anything
// local but older than the watermark that is missing from the cloud).

export type SyncResult = {
  ok: boolean;
  // Human-readable; surfaced on the Account page.
  error?: string;
};

// Fired on window whenever the local stores are replaced wholesale — a
// sync merge landing, or the logout clear. Mount-read screens re-read on it
// instead of showing pre-change content until the next navigation. Fires
// even when the push half of a sync fails — the local merge already landed
// and the UI should reflect it.
export const SYNC_APPLIED_EVENT = "mayreviewer:sync-applied";

function notifySyncApplied(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SYNC_APPLIED_EVENT));
}

type SyncMeta = {
  lastSyncedAt: string | null;
  lastError: string | null;
  // Whose data the last successful sync converged. Lets sign-in detect an
  // account switch on a shared device (see AuthProvider).
  lastUserId: string | null;
};

const SYNC_META_KEY = "mayreviewer-sync-meta";
// Push-on-change debounce: rapid successive saves (autosave ticks) collapse
// into one round-trip.
const PUSH_DEBOUNCE_MS = 5000;

function readMeta(): SyncMeta {
  const empty: SyncMeta = { lastSyncedAt: null, lastError: null, lastUserId: null };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(SYNC_META_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<SyncMeta>;
    return {
      lastSyncedAt: typeof parsed.lastSyncedAt === "string" ? parsed.lastSyncedAt : null,
      lastError: typeof parsed.lastError === "string" ? parsed.lastError : null,
      lastUserId: typeof parsed.lastUserId === "string" ? parsed.lastUserId : null,
    };
  } catch {
    return empty;
  }
}

function writeMeta(meta: SyncMeta): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
  } catch {
    // Best-effort: sync status must never break the app.
  }
}

export function getSyncMeta(): SyncMeta {
  return readMeta();
}

export function clearSyncMeta(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SYNC_META_KEY);
  } catch {
    // Best-effort (see writeMeta).
  }
}

function timeOf(value: string | undefined): number {
  if (!value) return -1;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? -1 : ms;
}

// Later updatedAt wins; ties and unparseable stamps keep local (deterministic
// — the same inputs always converge to the same row on every device).
export function mergeByUpdatedAt<T extends { id: string; updatedAt: string }>(
  local: T[],
  cloud: T[],
): T[] {
  const merged = new Map<string, T>();
  for (const row of local) merged.set(row.id, row);
  for (const row of cloud) {
    const current = merged.get(row.id);
    if (!current || timeOf(row.updatedAt) > timeOf(current.updatedAt)) {
      merged.set(row.id, row);
    }
  }
  return [...merged.values()];
}

export function mergeReviewers(local: Reviewer[], cloud: Reviewer[]): Reviewer[] {
  return mergeByUpdatedAt(local, cloud);
}

// Attempts are append-only snapshots — no updatedAt, nothing to last-write
// against. Union by id; a taken attempt is immutable so either copy is the
// same copy.
export function mergeAttempts(local: QuizAttempt[], cloud: QuizAttempt[]): QuizAttempt[] {
  const merged = new Map<string, QuizAttempt>();
  for (const attempt of cloud) merged.set(attempt.id, attempt);
  for (const attempt of local) merged.set(attempt.id, attempt);
  return [...merged.values()];
}

// Custom formats predate sync and carry no stamp; missing counts as epoch so
// any edited copy wins over an untouched one.
export function mergeFormats(local: ExamFormat[], cloud: ExamFormat[]): ExamFormat[] {
  return mergeByUpdatedAt(
    local.map((f) => ({ ...f, updatedAt: f.updatedAt ?? "" })),
    cloud.map((f) => ({ ...f, updatedAt: f.updatedAt ?? "" })),
  );
}

export function pickSettings(
  local: UserSettings,
  localUpdatedAt: string | null,
  cloud: UserSettings | null,
  cloudUpdatedAt: string | null,
): { settings: UserSettings; updatedAt: string | null; fromCloud: boolean } {
  if (!cloud) return { settings: local, updatedAt: localUpdatedAt, fromCloud: false };
  if (localUpdatedAt && cloudUpdatedAt && timeOf(localUpdatedAt) >= timeOf(cloudUpdatedAt)) {
    return { settings: local, updatedAt: localUpdatedAt, fromCloud: false };
  }
  if (!localUpdatedAt && !cloudUpdatedAt) {
    return { settings: local, updatedAt: null, fromCloud: false };
  }
  return { settings: cloud, updatedAt: cloudUpdatedAt, fromCloud: true };
}

type CloudRow<T> = { id: string; data: T; updated_at: string };

function isReviewerLike(value: unknown): value is Reviewer {
  return typeof value === "object" && value !== null && typeof (value as { id?: unknown }).id === "string";
}

function isAttemptLike(value: unknown): value is QuizAttempt {
  return typeof value === "object" && value !== null && typeof (value as { id?: unknown }).id === "string";
}

function isSettingsLike(value: unknown): value is UserSettings {
  return typeof value === "object" && value !== null;
}

let inFlight: Promise<SyncResult> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingUserId: string | null = null;

function shortError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message.slice(0, 200);
  return "Sync failed. Check your connection and try again.";
}

// Full pull-merge-push for one user. Safe to call concurrently — callers share
// the in-flight run. No-ops (ok: false) when unconfigured rather than
// throwing, so logged-out and local-only mode keep working untouched.
export function syncNow(userId: string): Promise<SyncResult> {
  if (inFlight) return inFlight;
  inFlight = runSync(userId).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

// Collapse rapid local saves into one round-trip. The login pull and the
// Settings "Sync now" button call syncNow() directly.
export function scheduleSync(userId: string): void {
  pendingUserId = userId;
  if (debounceTimer) return;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const id = pendingUserId;
    pendingUserId = null;
    if (id) void syncNow(id);
  }, PUSH_DEBOUNCE_MS);
}

async function runSync(userId: string): Promise<SyncResult> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: "Sync is not set up yet." };
  // Dynamic imports: storage/settings write the merged sets back through
  // bulk setters, and a static import here would cycle back into this module
  // through the tombstone-marking delete paths.
  const { replaceAllAttempts, replaceAllReviewers } = await import("@/app/lib/storage");
  const { replaceCustomFormats } = await import("@/app/lib/examFormats");
  const { replaceSettings } = await import("@/app/lib/settings");

  const watermark = readMeta().lastSyncedAt;
  const startedAt = new Date().toISOString();

  try {
    const [reviewersRes, attemptsRes, formatsRes, settingsRes] = await Promise.all([
      client.from("reviewers").select("id,data,updated_at").eq("user_id", userId),
      client.from("attempts").select("id,data,taken_at").eq("user_id", userId),
      client.from("formats").select("id,data,updated_at").eq("user_id", userId),
      client.from("settings").select("data,updated_at").eq("user_id", userId).maybeSingle(),
    ]);
    const firstError =
      reviewersRes.error ?? attemptsRes.error ?? formatsRes.error ?? settingsRes.error;
    if (firstError) throw firstError;

    const cloudReviewers = ((reviewersRes.data ?? []) as CloudRow<unknown>[]).filter((r) =>
      isReviewerLike(r.data),
    ) as CloudRow<Reviewer>[];
    const cloudAttempts = ((attemptsRes.data ?? []) as { id: string; data: unknown }[]).filter((r) =>
      isAttemptLike(r.data),
    ) as { id: string; data: QuizAttempt }[];
    const cloudFormats = ((formatsRes.data ?? []) as CloudRow<unknown>[]).filter((r) =>
      isValidFormatDef(r.data),
    ) as CloudRow<ExamFormat>[];
    const settingsRow = settingsRes.data as { data: unknown; updated_at: string } | null;
    const cloudSettings = settingsRow && isSettingsLike(settingsRow.data) ? settingsRow.data : null;

    const localReviewers = getReviewers();
    const localAttempts = getAllQuizHistory();
    const localFormats = getCustomFormats();

    // 1. Drop tombstoned ids from the cloud side — they stay deleted.
    // 2. Anything tombstoned that still exists in the cloud gets deleted on push.
    const collections: SyncCollection[] = ["reviewers", "attempts", "formats"];
    const cloudByCollection: Record<SyncCollection, Set<string>> = {
      reviewers: new Set(cloudReviewers.map((r) => r.id)),
      attempts: new Set(cloudAttempts.map((r) => r.id)),
      formats: new Set(cloudFormats.map((r) => r.id)),
    };
    const tombstonedInCloud: Record<SyncCollection, string[]> = {
      reviewers: [],
      attempts: [],
      formats: [],
    };
    for (const collection of collections) {
      for (const id of Object.keys(getTombstones(collection))) {
        if (cloudByCollection[collection].has(id)) tombstonedInCloud[collection].push(id);
      }
    }
    const notTombstoned = (collection: SyncCollection) => {
      const dead = new Set(Object.keys(getTombstones(collection)));
      return (id: string) => !dead.has(id);
    };
    const liveCloudReviewers = cloudReviewers
      .filter((r) => notTombstoned("reviewers")(r.id))
      .map((r) => r.data);
    const liveCloudAttempts = cloudAttempts
      .filter((r) => notTombstoned("attempts")(r.id))
      .map((r) => r.data);
    const liveCloudFormats = cloudFormats
      .filter((r) => notTombstoned("formats")(r.id))
      .map((r) => r.data);

    // 3. Local rows missing from the cloud that predate the watermark were
    // deleted on another device — drop them instead of re-pushing. Skipped
    // entirely before the first successful sync, when every local row is new.
    const deletedElsewhere = (id: string, stamp: string | undefined, cloudIds: Set<string>) =>
      watermark !== null && !cloudIds.has(id) && timeOf(stamp) < timeOf(watermark);
    const liveLocalReviewers = localReviewers.filter(
      (r) =>
        notTombstoned("reviewers")(r.id) &&
        !deletedElsewhere(r.id, r.updatedAt, cloudByCollection.reviewers),
    );
    const liveLocalAttempts = localAttempts.filter(
      (a) =>
        notTombstoned("attempts")(a.id) &&
        !deletedElsewhere(a.id, a.takenAt, cloudByCollection.attempts),
    );
    const liveLocalFormats = localFormats.filter(
      (f) =>
        notTombstoned("formats")(f.id) &&
        !deletedElsewhere(f.id, f.updatedAt, cloudByCollection.formats),
    );

    const mergedReviewers = mergeReviewers(liveLocalReviewers, liveCloudReviewers);
    const mergedAttempts = mergeAttempts(liveLocalAttempts, liveCloudAttempts);
    const mergedFormats = mergeFormats(liveLocalFormats, liveCloudFormats);
    const localSettings = getSettings();
    const picked = pickSettings(
      localSettings,
      getSettingsUpdatedAt(),
      cloudSettings,
      settingsRow?.updated_at ?? null,
    );

    replaceAllReviewers(mergedReviewers);
    replaceAllAttempts(mergedAttempts);
    replaceCustomFormats(mergedFormats);
    if (picked.fromCloud) replaceSettings(picked.settings, picked.updatedAt);
    notifySyncApplied();

    const tableFor: Record<SyncCollection, string> = {
      reviewers: "reviewers",
      attempts: "attempts",
      formats: "formats",
    };
    // Supabase builders are thenables, not Promises — Promise.all accepts
    // them, but the array must not claim Promise (no catch/finally).
    const upserts: PromiseLike<unknown>[] = [
      client.from("reviewers").upsert(
        mergedReviewers.map((r) => ({
          id: r.id,
          user_id: userId,
          data: r,
          updated_at: r.updatedAt,
        })),
      ),
      client.from("attempts").upsert(
        mergedAttempts.map((a) => ({
          id: a.id,
          user_id: userId,
          reviewer_id: a.reviewerId,
          data: a,
          taken_at: a.takenAt,
        })),
      ),
      client.from("formats").upsert(
        mergedFormats.map((f) => ({
          id: f.id,
          user_id: userId,
          data: f,
          updated_at: f.updatedAt ?? startedAt,
        })),
      ),
      client.from("settings").upsert({
        user_id: userId,
        data: picked.settings,
        updated_at: picked.updatedAt ?? startedAt,
      }),
    ];
    for (const collection of collections) {
      const ids = tombstonedInCloud[collection];
      if (ids.length > 0) {
        upserts.push(client.from(tableFor[collection]).delete().in("id", ids).eq("user_id", userId));
      }
    }
    const results = await Promise.all(upserts);
    for (const result of results) {
      const { error } = result as { error: { message: string } | null };
      if (error) throw error;
    }

    // Tombstones whose cloud delete just landed are spent. (A tombstone for
    // an id already absent from the cloud is spent too — nothing to delete.)
    for (const collection of collections) {
      clearTombstones(collection, [
        ...tombstonedInCloud[collection],
        ...Object.keys(getTombstones(collection)).filter((id) => !cloudByCollection[collection].has(id)),
      ]);
    }
    writeMeta({ lastSyncedAt: startedAt, lastError: null, lastUserId: userId });
    return { ok: true };
  } catch (err) {
    const error = shortError(err);
    writeMeta({ ...readMeta(), lastError: error });
    return { ok: false, error };
  }
}

// Empties the device of synced user data (logout path). Settings reset to
// defaults too — the cloud copy restores them on next login, and a logged-out
// device should look like a fresh one. Tombstones go with it: callers only
// invoke this after a successful flush, so every pending delete already
// landed in the cloud. The sync watermark and lastUserId stay — the next
// login merges the cloud back down against them correctly.
export async function clearLocalSyncedData(): Promise<void> {
  const { replaceAllAttempts, replaceAllReviewers } = await import("@/app/lib/storage");
  const { replaceCustomFormats } = await import("@/app/lib/examFormats");
  const { DEFAULT_SETTINGS, replaceSettings } = await import("@/app/lib/settings");
  const { clearAllTombstones } = await import("@/app/lib/tombstones");
  replaceAllReviewers([]);
  replaceAllAttempts([]);
  replaceCustomFormats([]);
  // Also dispatches the settings-changed event, so open Settings controls
  // re-read rather than showing the signed-in values.
  replaceSettings(DEFAULT_SETTINGS, null);
  clearAllTombstones();
  notifySyncApplied();
}

// Delete-account: wipes the user's cloud rows plus local keys, then the
// caller signs out. Attachments stay — they are device-local files, and the
// existing orphan cleanup covers reviewer-less sets. The Supabase auth user
// itself is not deletable with an anon key; re-login starts a fresh account.
export async function wipeAccountData(userId: string): Promise<SyncResult> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: "Sync is not set up yet." };
  const { replaceAllAttempts, replaceAllReviewers } = await import("@/app/lib/storage");
  const { replaceCustomFormats } = await import("@/app/lib/examFormats");
  const { replaceSettings } = await import("@/app/lib/settings");
  const { clearAllTombstones } = await import("@/app/lib/tombstones");

  try {
    const deletes = await Promise.all([
      client.from("reviewers").delete().eq("user_id", userId),
      client.from("attempts").delete().eq("user_id", userId),
      client.from("formats").delete().eq("user_id", userId),
      client.from("settings").delete().eq("user_id", userId),
    ]);
    for (const result of deletes) {
      if (result.error) throw result.error;
    }
    try {
      replaceAllReviewers([]);
      replaceAllAttempts([]);
      replaceCustomFormats([]);
      replaceSettings(DEFAULT_SETTINGS, null);
      clearAllTombstones();
      clearSyncMeta();
    } catch (err) {
      return { ok: false, error: shortError(err) };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: shortError(err) };
  }
}
