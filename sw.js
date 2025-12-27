/* SCORESTORE — Service Worker (PWA)
 * Estrategia:
 * - App Shell precache (HTML/CSS/manifest + logos clave)
 * - Navegación: Network-first con fallback al shell
 * - /assets y /css: Cache-first
 * - /data: Stale-while-revalidate
 * - Google Fonts: Stale-while-revalidate
 */
const VERSION = "2025-12-27.0000";
const STATIC_CACHE = `scorestore-static-${VERSION}`;
const RUNTIME_CACHE = `scorestore-runtime-${VERSION}`;

const APP_SHELL = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/site.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
  "/data/catalog.json",
  "/data/promos.json",
  "/assets/logo-score.webp",
  "/assets/logo-monster.png",
  "/assets/logo-unico.webp",
  "/assets/logo-bfgodrich.webp",
  "/assets/logo-ford.webp",
  "/assets/logo-rzr.webp",
  "/assets/logo-world-desert.webp",
  "/assets/logo-baja1000.webp",
  "/assets/logo-baja500.webp",
  "/assets/logo-baja400.webp",
  "/assets/logo-sf250.webp"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    // addAll falla si algo 404; aquí lo hacemos tolerante para no romper instalación.
    await Promise.all(
      APP_SHELL.map(async (url) => {
        try { await cache.add(url); } catch (_) {}
      })
    );
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith("scorestore-") && !k.includes(VERSION))
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isNavigationRequest(req) {
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
    if (fresh && fresh.ok) cache.put("/index.html", fresh.clone());
    return fresh;
  } catch (_) {
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

  // Stripe y pagos: no interceptar
  if (url.hostname.includes("stripe.com")) return;

  // Navegación: Network-first
  if (isNavigationRequest(req)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Mismo origen: assets/css
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/css/")) {
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