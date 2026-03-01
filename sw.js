/* SCORE STORE — Service Worker (PWA producción, resiliente v2.2.1)
   Objetivo: evitar “se queda en versión vieja” sin romper offline */

const CACHE_VERSION = "scorestore-vfx-pro-v2.2.1";
const CACHE_NAME = CACHE_VERSION;

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
  "/assets/fondo-pagina-score.webp",
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

async function reloadAllClients() {
  try {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.all(
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
            const req = new Request(asset, { cache: "reload" });
            const res = await fetch(req);
            if (res && (res.ok || res.type === "opaque")) {
              await cache.put(asset, res.clone());
            }
          } catch (_) {}
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
        } catch (_) {}
      }

      await self.clients.claim();

      // ✅ Cuando un SW nuevo activa, recarga todos los clientes para aplicar assets nuevos.
      await reloadAllClients();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Nunca interceptar proveedores
  if (
    url.origin.includes("stripe.com") ||
    url.origin.includes("supabase.co") ||
    url.origin.includes("envia.com")
  ) {
    return;
  }

  // Navegación: network-first (con preload) + fallback cache
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const preload = await event.preloadResponse;
          if (preload) return preload;

          const fresh = await fetch(req);
          if (fresh && fresh.ok && fresh.type === "basic") {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(req, fresh.clone());
          }
          return fresh;
        } catch (_) {
          const cachedPage = await caches.match(req, { ignoreSearch: true });
          if (cachedPage) return cachedPage;
          return (await caches.match("/index.html", { ignoreSearch: true })) || Response.error();
        }
      })()
    );
    return;
  }

  // JS/CSS => network-first (evita quedarse en versión vieja por cache + SW)
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/js/") || url.pathname.startsWith("/css/"))
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const fresh = await fetch(new Request(req.url, { cache: "reload" }));
          if (fresh && fresh.ok && (fresh.type === "basic" || fresh.type === "cors")) {
            await cache.put(req, fresh.clone());
          }
          return fresh;
        } catch (_) {
          const cached = await cache.match(req, { ignoreSearch: true });
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // Resto: stale-while-revalidate
  if (isSafeToCache(req.url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req, { ignoreSearch: true });

        const networkPromise = fetch(req)
          .then(async (res) => {
            if (res && res.ok && (res.type === "basic" || res.type === "cors")) {
              await cache.put(req, res.clone());
            }
            return res;
          })
          .catch(() => null);

        event.waitUntil(networkPromise);
        return cached || (await networkPromise) || Response.error();
      })()
    );
  }
});