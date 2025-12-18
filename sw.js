const SW_VERSION = "score-racing-v1";
const CACHE_STATIC = `${SW_VERSION}-static`;
const STATIC_ASSETS = [
  "/", "/index.html", "/data/catalog.json", "/data/promos.json",
  "/robots.txt", "/site.webmanifest",
  "/assets/fondo-pagina-score.png", "/assets/logo-score.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE_STATIC).then(c => c.addAll(STATIC_ASSETS)));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.map(k => (k.startsWith("score-") && k !== CACHE_STATIC) ? caches.delete(k) : null))
  ));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/.netlify/functions/")) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});