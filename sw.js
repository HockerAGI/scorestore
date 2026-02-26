/* SCORE STORE — Service Worker (PWA producción, resiliente v2.1) */
const CACHE_VERSION = "scorestore-vfx-pro-v2.1";
const CACHE_NAME = CACHE_VERSION;

// Agregadas las vistas de éxito, cancelación y legales para experiencia PWA completa
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/success.html",
  "/cancel.html",
  "/legal.html",
  "/css/styles.css",
  "/js/main.js",
  "/js/success.js",
  "/site.webmanifest",
  "/assets/logo-score.webp",
  "/assets/logo-world-desert.webp",
  "/assets/fondo-pagina-score.webp"
];

const isSafeToCache = (requestUrl) => {
  const url = new URL(requestUrl, self.location.origin);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  if (url.pathname.includes("/.netlify/")) return false;
  if (url.pathname.startsWith("/admin/")) return false;
  if (url.pathname.endsWith(".json")) return false;
  return true;
};

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(
      CORE_ASSETS.map(async (asset) => {
        try {
          const req = new Request(asset, { cache: "reload" });
          const res = await fetch(req);
          if (res && (res.ok || res.type === "opaque")) {
            await cache.put(asset, res.clone());
          }
        } catch (_) {}
      })
    );
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Destruye cualquier caché que no sea la nueva versión
    await Promise.all(keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : Promise.resolve())));
    if ("navigationPreload" in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  if (url.origin.includes("stripe.com") || url.origin.includes("supabase.co") || url.origin.includes("envia.com")) {
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;

        const fresh = await fetch(req);
        if (fresh && fresh.ok && fresh.type === "basic") {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone()); 
        }
        return fresh;
      } catch (_) {
        // FIX ESTRICTO: { ignoreSearch: true } permite cargar success.html en modo offline
        // ignorando los query strings (?session_id=...) de Stripe.
        const cachedPage = await caches.match(req, { ignoreSearch: true });
        if (cachedPage) return cachedPage;
        return (await caches.match("/index.html", { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }

  if (isSafeToCache(req.url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      // ignoreSearch protege la lectura general de recursos
      const cached = await cache.match(req, { ignoreSearch: true });
      const networkPromise = fetch(req)
        .then(async (res) => {
          if (res && res.ok && (res.type === "basic" || res.type === "cors")) {
            await cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => null);
      return cached || (await networkPromise) || Response.error();
    })());
  }
});