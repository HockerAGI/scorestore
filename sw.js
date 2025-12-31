// sw.js — SCORE STORE (PROD FINAL)
// Network-first: HTML/JS/JSON/manifest/xml/txt
// Cache-first: assets/css/icons
// Never cache: /.netlify/functions/*  and /data/*

const CACHE_VERSION = "v6";
const CACHE_NAME = `score-static-${CACHE_VERSION}`;

const PRECACHE = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
  "/site.webmanifest",

  // Core visuals (solo si existen)
  "/assets/logo-score.webp",
  "/assets/hero.webp",
  "/assets/fondo-pagina-score.webp",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Precarga segura (no revienta si un asset no existe)
      await Promise.all(
        PRECACHE.map(async (u) => {
          try {
            await cache.add(new Request(u, { cache: "reload" }));
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
      await Promise.all(
        keys
          .filter((k) => k.startsWith("score-static-") && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // solo GET
  if (req.method !== "GET") return;

  // solo same-origin
  if (url.origin !== self.location.origin) return;

  // NEVER cache Netlify Functions
  if (url.pathname.startsWith("/.netlify/functions")) return;

  // NEVER cache data dinámica
  if (url.pathname.startsWith("/data/")) {
    event.respondWith(fetch(req));
    return;
  }

  const isHTML = req.headers.get("accept")?.includes("text/html");
  const isNetFirst =
    isHTML ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".json") ||
    url.pathname.endsWith(".webmanifest") ||
    url.pathname.endsWith(".xml") ||
    url.pathname.endsWith(".txt");

  // Network-first para evitar JS/HTML viejo
  if (isNetFirst) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first para estáticos reales
  const isStatic =
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/css/") ||
    url.pathname.startsWith("/icons") ||
    url.pathname.startsWith("/assets/icons/");

  if (isStatic) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
    return;
  }

  // Default
  event.respondWith(fetch(req));
});