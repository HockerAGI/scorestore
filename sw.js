// SCORE STORE SERVICE WORKER
// Versión estable – Producción

const SW_VERSION = "score-store-v16";
const CACHE_STATIC = `${SW_VERSION}-static`;
const CACHE_DYNAMIC = `${SW_VERSION}-dynamic`;

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
  "/site.webmanifest",
  "/assets/icons-score.svg",
  "/assets/logo-score.webp",
  "/assets/hero.webp"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => !k.startsWith(SW_VERSION)).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;
  if (url.pathname.startsWith("/.netlify/")) return;
  if (url.hostname.includes("stripe")) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_DYNAMIC).then(c => c.put(req, clone));
        return res;
      })
      .catch(() => caches.match(req))
  );
});