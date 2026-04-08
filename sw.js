/* SCORE STORE — Service Worker
   UI fix:
   - Bump de versión para invalidar caches viejos
   - Precache de assets de catálogo y hero
   - No interceptar navegación
   - ignoreSearch para estilos con query string
*/

const VERSION = "scorestore-sw-v3-2026-04-08-images-ui";
const STATIC_CACHE = `scorestore-static-${VERSION}`;
const RUNTIME_CACHE = `scorestore-runtime-${VERSION}`;

const PRECACHE = [
  "/",
  "/index.html",
  "/success.html",
  "/cancel.html",
  "/legal.html",
  "/site.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
  "/css/styles.css",
  "/css/override.css",
  "/js/main.js",
  "/js/success.js",
  "/assets/logo-score.webp",
  "/assets/hero.webp",
  "/assets/fondo-pagina-score.webp",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/icon-192-maskable.png",
  "/assets/icons/icon-512-maskable.png",
  "/assets/edicion_2025/camiseta-negra-baja1000.webp",
  "/assets/edicion_2025/camiseta-gris-baja500-detalle.webp",
  "/assets/baja400/camiseta-cafe-oscuro-baja400.webp",
  "/assets/sf250/camiseta-negra-sinmangas-SF250.webp",
];

function shouldNeverCache(url) {
  try {
    const u = new URL(url);
    if (u.origin !== self.location.origin) return true;
    if (u.pathname.startsWith("/api/")) return true;
    return false;
  } catch {
    return true;
  }
}

async function cleanupOldCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys.map((key) => {
      if (key === STATIC_CACHE || key === RUNTIME_CACHE) return Promise.resolve();
      if (key.startsWith("scorestore-static-") || key.startsWith("scorestore-runtime-")) {
        return caches.delete(key);
      }
      return Promise.resolve();
    })
  );
}

async function safePrecache() {
  const cache = await caches.open(STATIC_CACHE);

  for (const url of PRECACHE) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res && res.ok) {
        await cache.put(url, res.clone());
      }
    } catch {
      // Silencioso
    }
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;

  const fresh = await fetch(req);
  if (fresh && fresh.ok) {
    await cache.put(req, fresh.clone());
  }
  return fresh;
}

async function staleWhileRevalidate(req, cacheName, event) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req, { ignoreSearch: true });

  const networkPromise = fetch(req)
    .then(async (fresh) => {
      if (fresh && fresh.ok) {
        await cache.put(req, fresh.clone());
      }
      return fresh;
    })
    .catch(() => null);

  if (cached) {
    event?.waitUntil?.(networkPromise);
    return cached;
  }

  const fresh = await networkPromise;
  return fresh || Response.error();
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await safePrecache();
      if (self.skipWaiting) await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await cleanupOldCaches();
      if (self.clients && self.clients.claim) {
        await self.clients.claim();
      }
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;
  if (req.mode === "navigate") return;
  if (shouldNeverCache(req.url)) return;

  if (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/css/") ||
    url.pathname.startsWith("/js/")
  ) {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE, event));
  }
});