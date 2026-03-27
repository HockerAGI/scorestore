/* SCORE STORE — Service Worker (Vercel-ready)
   Objetivos:
   - No cachear /api ni /data/*.json
   - Mantener navegación estable con fallback
   - Dar prioridad a assets core
   - Evitar quedarse pegado a versiones viejas
*/

const CACHE_VERSION = "scorestore-vfx-pro-v3.1.0";
const CACHE_NAME = CACHE_VERSION;

const CORE_ASSETS = [
  "/",
  "/index.html",
  "/success.html",
  "/cancel.html",
  "/legal.html",
  "/css/styles.css",
  "/css/override.css",
  "/js/main.js",
  "/js/success.js",
  "/site.webmanifest",
  "/assets/logo-score.webp",
  "/assets/logo-world-desert.webp",
  "/assets/fondo-pagina-score.webp",
  "/assets/hero.webp"
];

const isSameOrigin = (requestUrl) => {
  const url = new URL(requestUrl, self.location.origin);
  return url.origin === self.location.origin;
};

const shouldNeverCache = (requestUrl) => {
  const url = new URL(requestUrl, self.location.origin);
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith("/api/")) return true;
  if (url.pathname.startsWith("/data/")) return true;
  if (url.pathname.startsWith("/admin/")) return true;
  if (url.pathname.includes("/.netlify/")) return true;
  if (url.pathname.endsWith(".json")) return true;
  return false;
};

async function reloadAllClients() {
  try {
    const clients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    await Promise.allSettled(
      clients.map((client) => {
        try {
          return client.navigate(client.url);
        } catch {
          return null;
        }
      })
    );
  } catch {}
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.allSettled(
        CORE_ASSETS.map(async (asset) => {
          try {
            const res = await fetch(asset, { cache: "no-store" });
            if (res && res.ok) {
              await cache.put(asset, res.clone());
            }
          } catch {}
        })
      );
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null)));

      if ("navigationPreload" in self.registration) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {}
      }

      await self.clients.claim();
      await reloadAllClients();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  if (shouldNeverCache(req.url)) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);

        try {
          const preload = await event.preloadResponse;
          if (preload) {
            if (preload.ok) {
              await cache.put(req, preload.clone());
            }
            return preload;
          }

          const fresh = await fetch(req);
          if (fresh && fresh.ok) {
            await cache.put(req, fresh.clone());
          }
          return fresh;
        } catch {
          const cached =
            (await cache.match(req, { ignoreSearch: true })) ||
            (await cache.match("/index.html")) ||
            (await cache.match("/success.html")) ||
            (await cache.match("/cancel.html")) ||
            (await cache.match("/legal.html"));

          return cached || Response.error();
        }
      })()
    );
    return;
  }

  if (isSameOrigin(req.url) && CORE_ASSETS.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;

        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          await cache.put(req, fresh.clone());
        }
        return fresh;
      })()
    );
    return;
  }

  if (isSameOrigin(req.url) && (url.pathname.startsWith("/js/") || url.pathname.startsWith("/css/") || url.pathname.startsWith("/assets/"))) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const fresh = await fetch(new Request(req.url, { cache: "reload" }));
          if (fresh && fresh.ok && (fresh.type === "basic" || fresh.type === "cors")) {
            await cache.put(req, fresh.clone());
          }
          return fresh;
        } catch {
          const cached = await cache.match(req, { ignoreSearch: true });
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  if (isSameOrigin(req.url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req, { ignoreSearch: true });

        const networkPromise = fetch(req)
          .then(async (fresh) => {
            if (fresh && fresh.ok && (fresh.type === "basic" || fresh.type === "cors")) {
              await cache.put(req, fresh.clone());
            }
            return fresh;
          })
          .catch(() => null);

        event.waitUntil(networkPromise);

        return cached || (await networkPromise) || Response.error();
      })()
    );
  }
});