// sw.js — SCORE STORE (PROD FINAL)
const CACHE_VERSION = "v7"; // Incrementado para forzar actualización
const CACHE_NAME = `score-static-${CACHE_VERSION}`;

const PRECACHE = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
  "/site.webmanifest",
  // Assets visuales críticos
  "/assets/logo-score.webp",
  "/assets/hero.webp",
  "/assets/fondo-pagina-score.webp",
  "/assets/baja1000-texture.webp" // <--- AGREGADO NUEVO
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
        keys.filter((k) => k.startsWith("score-static-") && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
      );
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/.netlify/functions") || url.pathname.startsWith("/data/")) {
    event.respondWith(fetch(req));
    return;
  }
  const isHTML = req.headers.get("accept")?.includes("text/html");
  if (isHTML || url.pathname.endsWith(".js") || url.pathname.endsWith(".json")) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});