"use client";

import { useEffect } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import { LOCAL_CHANGE_EVENT } from "@/app/lib/localChange";
import { scheduleSync, syncNow } from "@/app/lib/sync";

// Background convergence while signed in:
// - login pull runs in AuthProvider (SIGNED_IN);
// - an immediate run on mount catches changes made elsewhere while away
//   (a persisted session fires no SIGNED_IN, so without this a second device
//   could sit stale for a full tick);
// - every local save notifies (see notifyLocalChange) and schedules a
//   debounced push, so edits upload within seconds instead of waiting out
//   the tick;
// - the slow tick, reconnect, and tab-return runs cover anything missed.
// Local-only mode (logged out or unconfigured) never reaches syncNow.
const SYNC_INTERVAL_MS = 60_000;

export default function SyncInit() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    const tick = () => {
      if (navigator.onLine) void syncNow(userId);
    };
    const onLocalChange = () => {
      if (navigator.onLine) scheduleSync(userId);
    };
    // First paint may already be stale (signed in on another device since).
    tick();
    const interval = setInterval(tick, SYNC_INTERVAL_MS);
    window.addEventListener("online", tick);
    window.addEventListener(LOCAL_CHANGE_EVENT, onLocalChange);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", tick);
      window.removeEventListener(LOCAL_CHANGE_EVENT, onLocalChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user]);

  return null;
}
