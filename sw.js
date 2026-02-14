/* ================================
   SERVICE WORKER — SCORE STORE PWA
   Version: 2026_PROD_UNIFIED_360_R2
   ================================ */

const VERSION = "2026_PROD_UNIFIED_360_R2";
const STATIC_CACHE = `score-static-${VERSION}`;
const RUNTIME_CACHE = `score-runtime-${VERSION}`;

const STATIC_ASSETS = [
  "/", 
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
  "/site.webmanifest",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/LOGO SCORE 2025 PNG.png",
  "/assets/Patrocinador oficial.png",
  "/assets/bg-desert.jpg",
  "/assets/bg-mountains.jpg",
  "/assets/bg-tire.jpg",
  "/data/catalog.json",
  "/data/promos.json",
  "/legal.html"
];

// Install: pre-cache core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate: cleanup old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      const kill = keys.filter((k) => k.startsWith("score-") && k !== STATIC_CACHE && k !== RUNTIME_CACHE);
      return Promise.all(kill.map((k) => caches.delete(k)));
    }).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for static, network-first for html, stale-while-revalidate for runtime
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== location.origin) return;

  // Network-first for navigations (fresh HTML)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() =>
        caches.match(req).then((cached) => cached || caches.match("/index.html"))
      )
    );
    return;
  }

  // Cache-first for known static assets
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // Stale-while-revalidate for everything else
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});