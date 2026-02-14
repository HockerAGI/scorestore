// SCORE STORE SERVICE WORKER — UNIFIED v2026_PROD_UNIFIED_361

const VERSION = "2026_PROD_UNIFIED_361";
const CACHE_NAME = `score-store-${VERSION}`;

const PRECACHE = [
  "/",
  "/index.html",
  "/legal.html",
  "/css/styles.css",
  "/js/main.js",

  // Brand / hero
  "/assets/logo-score.webp",
  "/assets/logo-world-desert.webp",
  "/assets/hero.webp",
  "/assets/fondo-pagina-score.webp",

  // Partners
  "/assets/logo-ford.webp",
  "/assets/logo-rzr.webp",
  "/assets/logo-bfgodrich.webp",
  "/assets/logo-unico.webp",

  // Events
  "/assets/logo-baja1000.webp",
  "/assets/logo-baja500.webp",
  "/assets/logo-baja400.webp",
  "/assets/logo-sf250.webp",

  // Icons
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/maskable-192.png",
  "/assets/icons/maskable-512.png",

  // Data
  "/data/catalog.json",
];

const stripSearch = (urlStr) => {
  try {
    const u = new URL(urlStr);
    u.search = "";
    return u.toString();
  } catch {
    return urlStr;
  }
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Don't cache API calls / functions
  if (url.pathname.startsWith("/.netlify/functions/") || url.pathname.startsWith("/api/")) {
    return;
  }

  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(stripSearch(req.url)).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(stripSearch(req.url), copy);
          });
          return res;
        })
        .catch(() => cached);
    })
  );
});