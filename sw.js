/* SCORE STORE — Service Worker
   Objetivo:
   - Precargar assets críticos del storefront
   - No interceptar navegación para evitar problemas con Lighthouse
   - Mantener navegación nativa y solo optimizar recursos estáticos
*/

const VERSION = "scorestore-sw-v1";
const STATIC_CACHE = `scorestore-static-${VERSION}`;
const RUNTIME_CACHE = `scorestore-runtime-${VERSION}`;

// El validador del repo exige explícitamente que se precachee /site.webmanifest.
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
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/icon-192-maskable.png",
  "/assets/icons/icon-512-maskable.png",
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

async function safePrecache() {
  const cache = await caches.open(STATIC_CACHE);

  for (const path of PRECACHE) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (res && res.ok) {
        await cache.put(path, res.clone());
      }
    } catch {
      // Silencioso: el sitio debe seguir arrancando aunque falle un asset puntual.
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
  event.waitUntil(safePrecache());
  // No forzar skipWaiting para evitar cambios bruscos entre versiones.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) =>
          key.startsWith("scorestore-") &&
          key !== STATIC_CACHE &&
          key !== RUNTIME_CACHE
            ? caches.delete(key)
            : null
        )
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;
  if (req.mode === "navigate") return;
  if (shouldNeverCache(req.url)) return;

  // Next chunks (hashed) => cache-first
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE, event));
    return;
  }

  if (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/css/") ||
    url.pathname.startsWith("/js/")
  ) {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE, event));
  }
});