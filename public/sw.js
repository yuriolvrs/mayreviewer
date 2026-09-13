// May Reviewer offline support. Read-only offline: reviewers, quizzes, and
// history are localStorage/IndexedDB (always available); this worker only
// keeps the app shell and visited pages loadable without a connection.
// /api/* (generation, inference, uploads) is never cached — those need the
// network and the UI gates them with an offline note instead.
const CACHE = "mayreviewer-v1";

self.addEventListener("install", (event) => {
  // A new worker takes over immediately so updates don't strand users on a
  // half-old shell behind an open tab.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("mayreviewer-") && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Generation traffic: always live, never stored.
  if (url.pathname.startsWith("/api/")) return;

  // Hashed build assets: immutable, cache-first.
  if (url.pathname.startsWith("/_next/static")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) await cache.put(request, res.clone());
        return res;
      })(),
    );
    return;
  }

  // Pages: network-first so content stays fresh, cached fallback offline.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(request);
          if (res.ok) await cache.put(request, res.clone());
          return res;
        } catch {
          const hit = await cache.match(request);
          if (hit) return hit;
          const home = await cache.match("/");
          if (home) return home;
          return new Response("You're offline and this page isn't cached yet.", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        }
      })(),
    );
  }
});
