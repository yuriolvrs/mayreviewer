// Local deletion records for sync. Pull-merge-push alone resurrects deletes:
// a reviewer deleted on device A is absent locally but present in the cloud,
// so a naive merge re-adds it. Tombstones close the loop — the push phase
// deletes tombstoned ids from the cloud, and the pull phase drops local rows
// that vanished from the cloud since the last sync (deleted elsewhere).
// Standalone module (localStorage only) so both storage.ts and sync.ts can
// import it without a cycle.

export type SyncCollection = "reviewers" | "attempts" | "formats";

const TOMBSTONES_KEY = "mayreviewer-tombstones";
// Upper bound so the set can't grow without limit on a pathological client.
const MAX_TOMBSTONES_PER_COLLECTION = 500;

type TombstoneMap = Partial<Record<SyncCollection, Record<string, string>>>;

function readAll(): TombstoneMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(TOMBSTONES_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as TombstoneMap;
  } catch {
    return {};
  }
}

function writeAll(map: TombstoneMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(map));
  } catch {
    // Best-effort: a failed tombstone write only risks a resurrected row,
    // never data loss.
  }
}

export function markDeleted(collection: SyncCollection, id: string): void {
  const all = readAll();
  const next = { ...(all[collection] ?? {}), [id]: new Date().toISOString() };
  const ids = Object.keys(next);
  if (ids.length > MAX_TOMBSTONES_PER_COLLECTION) {
    // Oldest first — the ones most likely already synced through.
    ids
      .sort((a, b) => (next[a] < next[b] ? -1 : 1))
      .slice(0, ids.length - MAX_TOMBSTONES_PER_COLLECTION)
      .forEach((id) => delete next[id]);
  }
  writeAll({ ...all, [collection]: next });
}

export function getTombstones(collection: SyncCollection): Record<string, string> {
  return readAll()[collection] ?? {};
}

export function clearTombstones(collection: SyncCollection, ids: string[]): void {
  const all = readAll();
  const next = { ...(all[collection] ?? {}) };
  ids.forEach((id) => delete next[id]);
  writeAll({ ...all, [collection]: next });
}

export function clearAllTombstones(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOMBSTONES_KEY);
  } catch {
    // Best-effort (see writeAll).
  }
}
