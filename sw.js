const CACHE_NAME = "score-store-v2";

const CORE_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/main.js",
  "/site.webmanifest",

  // Visual core
  "/assets/hero.webp",
  "/assets/logo-score.webp",
  "/assets/fondo-pagina-score.webp",

  // PWA icons
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",

  // Data
  "/data/catalog.json",
  "/data/promos.json"
];

// INSTALL
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
});

// ACTIVATE
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// FETCH
self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);

  // ❌ Nunca cachear Netlify Functions
  if (url.pathname.startsWith("/.netlify/functions/")) return;

  // HTML & JSON → network first (Lighthouse + PWA correcto)
  if (req.mode === "navigate" || url.pathname.endsWith(".json")) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Assets → cache first
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req))
  );
});