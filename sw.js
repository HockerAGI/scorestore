/* SCORESTORE — Service Worker (PWA)
 * Estrategia:
 * - App Shell precache (HTML + manifest + imágenes clave)
 * - Navegación: network-first con fallback al shell
 * - /assets: cache-first
 * - /data: stale-while-revalidate
 * - Google Fonts: stale-while-revalidate
 */

const VERSION = "2025-12-23.1";
const STATIC_CACHE = `scorestore-static-${VERSION}`;
const RUNTIME_CACHE = `scorestore-runtime-${VERSION}`;

// ✅ Mantén esta lista corta para no “inflar” el SW.
// (Si falta un archivo, NO debe romper la instalación.)
const APP_SHELL = [
  "/",
  "/index.html",
  "/site.webmanifest",
  "/sitemap.xml",
  "/robots.txt",
  "/assets/fondo-pagina-score.webp",
  "/assets/logo-score.webp",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // addAll falla si un recurso 404 → mejor individual y tolerante.
      await Promise.all(
        APP_SHELL.map(async (url) => {
          try {
            await cache.add(url);
          } catch (_) {
            // ignore (el sitio debe seguir funcionando)
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("scorestore-") && !k.includes(VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isHTMLRequest(req) {
  return (
    req.mode === "navigate" ||
    (req.method === "GET" && (req.headers.get("accept") || "").includes("text/html"))
  );
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;

  const fresh = await fetch(req);
  if (fresh && fresh.ok) cache.put(req, fresh.clone());
  return fresh;
}

async function networkFirst(req) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (_) {
    // fallback a shell
    const cached = await cache.match("/index.html");
    return cached || new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((fresh) => {
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    })
    .catch(() => null);

  return cached || (await fetchPromise) || new Response("Offline", { status: 503 });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // No tocar Stripe
  if (url.hostname.includes("stripe.com")) return;

  // Navegación: network-first con fallback
  if (isHTMLRequest(req)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Mismo origen
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/assets/")) {
      event.respondWith(cacheFirst(req, RUNTIME_CACHE));
      return;
    }
    if (url.pathname.startsWith("/data/")) {
      event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
      return;
    }
  }

  // Google Fonts: SWR
  if (
    url.hostname.endsWith("fonts.googleapis.com") ||
    url.hostname.endsWith("fonts.gstatic.com")
  ) {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
    return;
  }
});