/* SCORE STORE — Service Worker (simple, safe caching) */
const VERSION = "scorestore-v1.2.0";
const CORE = [
  "/",
  "/index.html",
  "/site.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
  "/assets/logo-score.png",
  "/assets/logo-unico.png",
  "/assets/fondo-pagina-score.png",
  "/assets/hero.png",
  "/assets/Icono-carrito-compra.png",
  "/assets/icono-compra-exitosa.png",
  "/data/catalog.json",
  "/data/promos.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;

  // Cache-first para assets/data; Network-first para HTML
  const isHTML = req.headers.get("accept")?.includes("text/html");

  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/index.html")))
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/data/")) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((cache) => cache.put(req, copy));
        return res;
      }))
    );
  }
});