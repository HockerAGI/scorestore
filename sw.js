const CACHE_NAME = "score-store-pwa-v3";
const ASSETS = [
  "/",
  "/index.html",
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
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", e => {
  if (e.request.destination === "image") {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});