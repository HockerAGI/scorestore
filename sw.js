// sw.js — SCORE STORE (PROD FINAL)
// Network-first: HTML/JS/JSON/manifest/xml/txt
// Cache-first: assets/css/icons
// Never cache: /.netlify/functions/* and /data/*

const CACHE_VERSION = "v7-desert-pro"; // Actualizado
const CACHE_NAME = `score-static-${CACHE_VERSION}`;

const PRECACHE = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
  "/site.webmanifest",
  // Core visuals
  "/assets/logo-score.webp",
  "/assets/hero.webp",
  "/assets/fondo-pagina-score.webp",
  "/assets/baja1000-texture.webp"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        PRECACHE.map(async (u) => {
          try { await cache.add(new Request(u, { cache: "reload" })); } catch (_) {}
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

  if (req.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/.netlify/functions")) return;

  // No cachear datos dinámicos (catálogos pueden cambiar)
  if (url.pathname.startsWith("/data/")) {
    event.respondWith(fetch(req));
    return;
  }

  // Estrategia Network-First para contenido crítico
  const isNetFirst =
    req.headers.get("accept")?.includes("text/html") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".json");

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

  // Estrategia Cache-First para Assets pesados
  const isStatic =
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/css/") ||
    url.pathname.startsWith("/icons");

  if (isStatic) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
    return;
  }

  event.respondWith(fetch(req));
});
