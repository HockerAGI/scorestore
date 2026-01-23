/* sw.js - VERSIÓN DE PRODUCCIÓN v2026_FINAL (CACHE BUSTING) */
const CACHE_NAME = "score-store-v2026_prod_final";

// Lista crítica de assets
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

// Precache con estrategia "reload" para ignorar caché HTTP vieja
async function safePrecache(cache, urls) {
  await Promise.allSettled(
    urls.map(async (url) => {
      try {
        const res = await fetch(url, { cache: "reload" });
        if (res.ok) await cache.put(url, res);
      } catch {}
    })
  );
}

self.addEventListener("install", (event) => {
  self.skipWaiting(); // Activar inmediatamente
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => safePrecache(cache, ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // Borrar cualquier caché antigua que no sea la v2026_prod_final
      await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)));
      await self.clients.claim(); // Tomar control de inmediato
    })()
  );
});

// Estrategia Stale-While-Revalidate para máxima velocidad + actualización
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== location.origin) return;

  // HTML: Siempre red primero (Network First)
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

  // Assets (CSS, JS, Imágenes): Usar caché pero actualizar en fondo
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      });
      return cached || networkFetch;
    })
  );
});