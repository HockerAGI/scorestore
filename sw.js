/* =========================================================
   SCORE STORE — Service Worker (Vercel-safe)
   - No cachea /api/*
   - Network-first para navegación
   - Cache-first para assets estáticos
   - Skip waiting + claim
   ========================================================= */

const SW_VERSION = "2026.04.PREMIUM.VERCEL";
const STATIC_CACHE = `scorestore-static-${SW_VERSION}`;
const RUNTIME_CACHE = `scorestore-runtime-${SW_VERSION}`;

const OFFLINE_FALLBACK = "/";
const BYPASS_PREFIXES = [
  "/api/",
  "/_next/",
  "/.well-known/",
  "/favicon.ico",
];

const SAME_ORIGIN = self.location.origin;

const isSameOrigin = (url) => url.origin === SAME_ORIGIN;
const isBypass = (url) => BYPASS_PREFIXES.some((p) => url.pathname.startsWith(p));

const isStaticAsset = (url) => {
  if (!isSameOrigin(url) || isBypass(url)) return false;
  return /\.(?:css|js|mjs|json|png|jpg|jpeg|gif|webp|avif|svg|ico|woff2?|ttf|otf|map)$/i.test(url.pathname);
};

const cachePutSafe = async (cacheName, request, response) => {
  try {
    if (!response || !response.ok) return;
    const cache = await caches.open(cacheName);
    await cache.put(request, response);
  } catch {}
};

const fetchAndCache = async (request, cacheName = RUNTIME_CACHE) => {
  const response = await fetch(request);
  await cachePutSafe(cacheName, request, response.clone());
  return response;
};

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(STATIC_CACHE);
      await cache.add(new Request(OFFLINE_FALLBACK, { cache: "reload" }));
    } catch {}
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith("scorestore-") && key !== STATIC_CACHE && key !== RUNTIME_CACHE)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (!isSameOrigin(url) || isBypass(url)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);
        await cachePutSafe(STATIC_CACHE, OFFLINE_FALLBACK, networkResponse.clone());
        return networkResponse;
      } catch {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;

        const fallback = await caches.match(OFFLINE_FALLBACK);
        if (fallback) return fallback;

        return new Response(
          "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Score Store</title></head><body><p>Sin conexión.</p></body></html>",
          {
            headers: { "Content-Type": "text/html; charset=utf-8" },
            status: 200,
          }
        );
      }
    })());
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) {
        event.waitUntil((async () => {
          try {
            const fresh = await fetch(request);
            await cachePutSafe(STATIC_CACHE, request, fresh.clone());
          } catch {}
        })());
        return cached;
      }

      try {
        const fresh = await fetch(request);
        await cachePutSafe(STATIC_CACHE, request, fresh.clone());
        return fresh;
      } catch {
        return caches.match(OFFLINE_FALLBACK);
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) {
      event.waitUntil((async () => {
        try {
          const fresh = await fetch(request);
          await cachePutSafe(RUNTIME_CACHE, request, fresh.clone());
        } catch {}
      })());
      return cached;
    }

    try {
      return await fetchAndCache(request, RUNTIME_CACHE);
    } catch {
      return new Response("", { status: 504, statusText: "Gateway Timeout" });
    }
  })());
});