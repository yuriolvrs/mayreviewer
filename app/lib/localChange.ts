// "Something on this device changed" signal. User-write entry points in
// storage.ts, examFormats.ts, and settings.ts call notifyLocalChange() after
// saving; SyncInit listens and schedules a push. Sync's own bulk writers
// (replaceAll*) deliberately do NOT notify — the data just came from a sync,
// and notifying would schedule a pointless echo round-trip.
// Standalone module so stores can import it without a cycle.

export const LOCAL_CHANGE_EVENT = "mayreviewer:local-change";

export function notifyLocalChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
}
