/* sw.js — SCORE Store
   Service Worker básico (cache-first para assets, network-first para HTML)
   ✅ No cambia tu diseño. Solo mejora PWA + un poco performance/offline.
*/

const VERSION = "scorestore-sw-v1";
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

// Ajusta si tu deploy usa subpath. En Netlify root normalmente es "/".
const APP_SHELL = [
  "/",
  "/index.html",
  "/site.webmanifest",
  "/assets/favicon.png",
  "/assets/apple-touch-icon.png",
  "/assets/logo-score.png",
  "/assets/hero.png",
  "/assets/fondo-pagina-score.png",
  "/assets/baja1000-texture.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => ![STATIC_CACHE, RUNTIME_CACHE].includes(k))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Solo maneja mismo origen
  if (url.origin !== self.location.origin) return;

  const accept = req.headers.get("accept") || "";
  const isHTML = accept.includes("text/html");

  // ✅ HTML: network-first (para no "atorar" deploys nuevos)
  if (isHTML) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch (e) {
          const cached = await caches.match(req);
          return cached || caches.match("/index.html");
        }
      })()
    );
    return;
  }

  // ✅ Assets: cache-first
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;

      try {
        const res = await fetch(req);
        const cache = await caches.open(RUNTIME_CACHE);

        // Cachea solo respuestas OK/básicas
        if (res && (res.status === 200 || res.type === "basic")) {
          cache.put(req, res.clone());
        }
        return res;
      } catch (e) {
        // Fallback silencioso si no hay red ni cache
        return cached || Response.error();
      }
    })()
  );
});