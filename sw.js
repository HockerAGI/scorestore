const CACHE = "scorestore-v1";
const CORE = [
  "/",
  "/index.html",
  "/robots.txt",
  "/sitemap.xml",
  "/site.webmanifest",
  "/assets/favicon.png",
  "/assets/logo-score.png",
  "/assets/hero.png",
  "/assets/fondo-pagina-score.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : null))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // No cachear funciones
  if (url.pathname.startsWith("/.netlify/functions/")) return;

  // Cache-first para estáticos
  if (req.method === "GET") {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy)).catch(()=>{});
          return res;
        }).catch(() => cached);
      })
    );
  }
});