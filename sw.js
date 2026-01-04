const CACHE_NAME = "score-store-pwa-v5";

const ASSETS = [
  "/",
  "/css/styles.css",
  "/js/main.js",
  "/data/catalog.json",
  "/assets/logo-score.webp",
  "/assets/hero.webp",
  "/assets/fondo-pagina-score.webp",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png"
];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(keys =>
        Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k)))
      )
    ])
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;

  // Nunca cachear llamadas dinámicas (Stripe / Netlify)
  if (req.url.includes("/.netlify/functions/")) return;

  // Imágenes: network first con fallback
  if (req.destination === "image") {
    e.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // Static assets: cache first
  e.respondWith(
    caches.match(req).then(res => res || fetch(req))
  );
});