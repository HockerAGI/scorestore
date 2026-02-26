/* SCORE STORE — Service Worker (PWA producción, auto-update v3)
   FIX REAL:
   - Navegación: NETWORK-FIRST (siempre intenta lo último en producción)
   - Assets: STALE-WHILE-REVALIDATE REAL con event.waitUntil()
   - Nunca cachea /api ni .netlify functions
*/

const CACHE_NAME = "scorestore-runtime-v3";

const PRECACHE = [
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
  "/assets/fondo-pagina-score.webp",
];

const isBypass = (req) => {
  const url = new URL(req.url);
  if (req.method !== "GET") return true;
  if (url.origin !== self.location.origin) return true;

  // Nunca cachear APIs / Netlify / admin / data dinámica
  if (url.pathname.startsWith("/api/")) return true;
  if (url.pathname.startsWith("/.netlify/")) return true;
  if (url.pathname.startsWith("/admin/")) return true;
  if (url.pathname.endsWith(".json")) return true;

  return false;
};

const openCache = () => caches.open(CACHE_NAME);

async function safePut(cache, key, res) {
  try {
    if (res && res.ok && (res.type === "basic" || res.type === "cors")) {
      await cache.put(key, res.clone());
    }
  } catch (_) {}
}

async function precacheCore() {
  const cache = await openCache();
  await Promise.allSettled(
    PRECACHE.map(async (path) => {
      try {
        const req = new Request(path, { cache: "reload" });
        const res = await fetch(req);
        if (res && (res.ok || res.type === "opaque")) {
          await cache.put(path, res.clone());
        }
      } catch (_) {}
    })
  );
}

async function networkFirst(event) {
  const req = event.request;
  const cache = await openCache();

  try {
    const preload = await event.preloadResponse;
    if (preload) {
      event.waitUntil(safePut(cache, req, preload));
      return preload;
    }

    const fresh = await fetch(req);
    event.waitUntil(safePut(cache, req, fresh));
    return fresh;
  } catch (_) {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;

    // fallback final
    const fallback = await cache.match("/index.html", { ignoreSearch: true });
    return fallback || Response.error();
  }
}

function staleWhileRevalidate(event) {
  const req = event.request;

  return (async () => {
    const cache = await openCache();
    const cached = await cache.match(req, { ignoreSearch: true });

    const fetchPromise = fetch(req)
      .then(async (res) => {
        await safePut(cache, req, res);
        return res;
      })
      .catch(() => null);

    // CLAVE: mantiene vivo el update aunque devolvamos cached
    event.waitUntil(fetchPromise);

    return cached || (await fetchPromise) || Response.error();
  })();
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(precacheCore());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));

      if ("navigationPreload" in self.registration) {
        try { await self.registration.navigationPreload.enable(); } catch (_) {}
      }

      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (isBypass(req)) return;

  // Navegación (HTML): SIEMPRE NETWORK-FIRST para evitar “no se actualiza”
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(networkFirst(event));
    return;
  }

  // Assets / recursos: SWR real
  event.respondWith(staleWhileRevalidate(event));
});