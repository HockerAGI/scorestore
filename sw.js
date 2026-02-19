/* SCORE STORE — Service Worker (Light) */
const CACHE_VERSION = "scorestore-v2026.02.19.1";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
  "/site.webmanifest",
  "/data/catalog.json",
  "/assets/logo-score.webp",
  "/assets/logo-world-desert.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await cache.addAll(CORE_ASSETS.map((u) => u));
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE_VERSION ? null : caches.delete(k))));
      self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Nunca caches API
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;

  // Solo GET
  if (req.method !== "GET") return;

  // Navegación: network-first con fallback cache
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_VERSION);
          cache.put("/index.html", fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match("/index.html");
          return cached || new Response("Offline", { status: 200 });
        }
      })()
    );
    return;
  }

  // Assets: cache-first, revalidate en background
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) {
        event.waitUntil(
          (async () => {
            try {
              const fresh = await fetch(req);
              const cache = await caches.open(CACHE_VERSION);
              cache.put(req, fresh);
            } catch {}
          })()
        );
        return cached;
      }

      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return new Response("", { status: 504 });
      }
    })()
  );
});