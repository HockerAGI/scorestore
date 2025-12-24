const SW_VERSION = "score-store-v9"; // Versión nueva
const CACHE_STATIC = `${SW_VERSION}-static`;
const CACHE_RUNTIME = `${SW_VERSION}-runtime`;

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
  "/robots.txt",
  "/site.webmanifest",
  "/assets/logo-score.webp",
  "/assets/icons-score.svg",
  "/assets/hero.webp",
  "/assets/fondo-pagina-score.webp"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_STATIC).then((cache) => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((k) => {
        if (k.startsWith("score-store-") && k !== CACHE_STATIC && k !== CACHE_RUNTIME) {
          return caches.delete(k);
        }
      })
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.pathname.startsWith("/.netlify/") || url.pathname.includes("api")) return; 

  // Stale-While-Revalidate para JSON (Catálogo)
  if (url.pathname.endsWith(".json")) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkFetch = fetch(req).then((res) => {
          caches.open(CACHE_RUNTIME).then((cache) => cache.put(req, res.clone()));
          return res;
        });
        return cached || networkFetch;
      })
    );
    return;
  }

  // Cache First para Assets
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/js/") || url.pathname.startsWith("/css/")) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          caches.open(CACHE_RUNTIME).then((cache) => cache.put(req, res.clone()));
          return res;
        });
      })
    );
    return;
  }

  event.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
