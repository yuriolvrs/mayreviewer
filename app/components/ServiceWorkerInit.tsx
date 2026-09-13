"use client";

import { useEffect } from "react";

// Registers the offline service worker. Production only: in dev the worker
// would cache half-built pages and make debugging miserable.
export default function ServiceWorkerInit() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is a bonus — a failed registration must never break
      // the app. Everything local keeps working without it.
    });
  }, []);
  return null;
}
