/* SCORE STORE — Service Worker (estable) */
const CACHE_NAME = "score-store-v3";

const CORE_ASSETS = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
  "/site.webmanifest",
  "/data/catalog.json",
  "/data/promos.json",
  "/assets/hero.webp",
  "/assets/logo-score.webp",
  "/assets/icons-score.svg"
];

// Opcionales (si existen, los cachea; si no, NO rompe la instalación)
const OPTIONAL_ASSETS = [
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-192-maskable.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/icon-512-maskable.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);

    // opcionales sin romper
    await Promise.allSettled(
      OPTIONAL_ASSETS.map(async (u) => {
        try { await cache.add(u); } catch {}
      })
    );

    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    self.clients.claim();
  })());
});

function isHTML(req) {
  return req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
}
function isJSON(req) {
  return (req.headers.get("accept") || "").includes("application/json") || req.url.endsWith(".json");
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Network-first para HTML/JSON (para que se actualice)
  if (isHTML(event.request) || isJSON(event.request) || event.request.url.endsWith("/sw.js") || event.request.url.endsWith("/site.webmanifest")) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(event.request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        // fallback navegación
        if (isHTML(event.request)) return (await caches.match("/index.html")) || Response.error();
        return Response.error();
      }
    })());
    return;
  }

  // Cache-first para assets
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const fresh = await fetch(event.request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(event.request, fresh.clone());
    return fresh;
  })());
});