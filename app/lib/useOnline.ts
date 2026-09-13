import { useSyncExternalStore } from "react";

function subscribe(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

// Tracks navigator.onLine so server-dependent actions (generation, format
// inference) can disable themselves with an explanation instead of failing.
// Server snapshot is online: SSR has no navigator, and assuming offline would
// disable generation on first paint for everyone.
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
