/* SCORE STORE — Service Worker (anti-cache-bugs)
   Objetivo: NO romper updates (Baja400/partners/animaciones)
*/
const SW_VERSION = "score-sw-v12";
const CACHE_STATIC = `${SW_VERSION}-static`;

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/catalog.json",
  "/promos.json",
  "/robots.txt",
  "/sitemap.xml",
  "/site.webmanifest",
  "/assets/hero.png",
  "/assets/fondo-pagina-score.png",
  "/assets/baja1000-texture.png",
  "/assets/logo-score.png",
  "/assets/logo-baja1000.png",
  "/assets/logo-sf250.png",
  "/assets/logo-baja500.png",
  "/assets/logo-baja400.png",
  "/assets/logo-ford.png",
  "/assets/logo-rzr.png",
  "/assets/logo-bfgoodrich.png",
  "/assets/logo-monster.png",
  "/assets/logo-unico.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_STATIC);
    await cache.addAll(STATIC_ASSETS.map(u => new Request(u, { cache: "reload" })));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k.startsWith("score-sw-") && k !== CACHE_STATIC) ? caches.delete(k) : null));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // No interceptar Netlify Functions
  if (url.pathname.startsWith("/.netlify/functions/")) return;

  // HTML: Network-first (para que NO se quede viejo)
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        const cache = await caches.open(CACHE_STATIC);
        cache.put("/index.html", fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match("/index.html");
        return cached || new Response("Offline", { status: 503 });
      }
    })());
    return;
  }

  // JSON: Network-first (catálogo/promos)
  if (url.pathname.endsWith(".json")) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        const cache = await caches.open(CACHE_STATIC);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(req)) || new Response(null, { status: 504 });
      }
    })());
    return;
  }

  // Assets: Cache-first
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    const fresh = await fetch(req);
    const cache = await caches.open(CACHE_STATIC);
    cache.put(req, fresh.clone());
    return fresh;
  })());
});