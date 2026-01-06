const CACHE_NAME = "score-store-pwa-v4";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/legal.html",
  "/css/styles.css",
  "/js/main.js",
  "/data/catalog.json",
  "/data/promos.json",
  "/site.webmanifest",
  "/icons-score.svg",

  // Assets principales (si alguno no existe, no debe romper el SW)
  "/assets/logo-score.webp",
  "/assets/hero.webp",
  "/assets/fondo-pagina-score.webp"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Importante: NO usar addAll directo (si 1 archivo da 404, se cae toda la instalación)
      await Promise.allSettled(
        CORE_ASSETS.map(async (url) => {
          try { await cache.add(url); } catch (_) {}
        })
      );
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo cacheamos same-origin
  if (url.origin !== location.origin) return;

  // Navegaciones: Network First con fallback
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put("/", fresh.clone());
          return fresh;
        } catch (_) {
          return (await caches.match(req)) || (await caches.match("/index.html")) || (await caches.match("/")) || Response.error();
        }
      })()
    );
    return;
  }

  // Estáticos: Stale-While-Revalidate
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);

      const fetchPromise = fetch(req)
        .then(async (res) => {
          if (res && res.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => null);

      return cached || (await fetchPromise) || Response.error();
    })()
  );
});