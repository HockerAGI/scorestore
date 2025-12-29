const CACHE_NAME = "score-pwa-v4";

const CORE_ASSETS = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
  "/site.webmanifest",

  // Visual core
  "/assets/hero.webp",
  "/assets/fondo-pagina-score.webp",

  // PWA icons
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",

  // Data
  "/data/catalog.json",
  "/data/promos.json"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // ❌ NO cachear Netlify Functions
  if (url.pathname.startsWith("/.netlify/functions/")) return;

  // HTML + JSON → network first
  if (event.request.mode === "navigate" || url.pathname.endsWith(".json")) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Assets → cache first
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});