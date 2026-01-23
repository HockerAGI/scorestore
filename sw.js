/* sw.js - VERSIÓN DE PRODUCCIÓN v2026_FINAL (CACHE BUSTING) */
const CACHE_NAME = "score-store-v2026_prod_final";

// Lista crítica de assets para precarga
const ASSETS = [
  "/",
  "/index.html",
  "/legal.html",
  "/css/styles.css",
  "/js/main.js",
  "/data/catalog.json",
  "/data/promos.json",
  "/assets/logo-score.webp",
  "/site.webmanifest"
];

// precache tolerante
async function safePrecache(cache, urls) {
  await Promise.allSettled(
    urls.map(async (url) => {
      try {
        // cache: "reload" fuerza al navegador a ir a la red y no usar caché de disco antigua
        const res = await fetch(url, { cache: "reload" });
        if (res.ok) await cache.put(url, res);
      } catch {}
    })
  );
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => safePrecache(cache, ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // Borrar cualquier caché antigua que no coincida con la nueva versión
      await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)));
      await self.clients.claim();
    })()
  );
});

// network-first for html, cache-first for others
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== location.origin) return;

  // HTML siempre fresco (Network First)
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put("/index.html", copy));
          return res;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Assets estáticos (Stale-While-Revalidate para velocidad + actualización)
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      });

      // Si existe en caché, úsalo pero actualiza en fondo. Si no, ve a red.
      return cached || networkFetch;
    })
  );
});