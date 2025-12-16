/* SCORE STORE — Service Worker
   Cache-first para assets
   Network-first para data (catálogo/promos)
*/
const VERSION = "v3.2.0";
const CACHE_NAME = `score-store-${VERSION}`;

const CORE = [
  "/",
  "/index.html",
  "/robots.txt",
  "/sitemap.xml",
  "/site.webmanifest",
  "/data/catalog.json",
  "/data/promos.json",
  "/assets/hero.png",
  "/assets/logo-score.png",
  "/assets/icono-carrito-compra.png",
  "/assets/icono-compra-exitosa.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    ).then(() => self.clients.claim())
  );
});

function isDataReq(req) {
  const url = new URL(req.url);
  return url.pathname.startsWith("/data/");
}
function isAssetReq(req) {
  const url = new URL(req.url);
  return url.pathname.startsWith("/assets/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Network-first for /data to always get latest catalog/promos
  if (isDataReq(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/index.html")))
    );
    return;
  }

  // Cache-first for assets
  if (isAssetReq(req)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // Default: stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});