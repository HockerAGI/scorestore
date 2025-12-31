// sw.js — FORCE UPDATE v30
const CACHE_VERSION = "v30_FORCE_RESET"; // <--- ESTO ES CLAVE
const CACHE_NAME = `score-static-${CACHE_VERSION}`;

const PRECACHE = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
  "/site.webmanifest",
  "/assets/logo-score.webp",
  "/assets/hero.webp",
  "/assets/fondo-pagina-score.webp",
  "/assets/baja1000-texture.webp"
];

self.addEventListener("install", (event) => {
  self.skipWaiting(); // Activar inmediatamente
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" })).catch(()=>{}))
      );
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => 
      Promise.all(
        keys.map((key) => {
          if (key.startsWith("score-static-") && key !== CACHE_NAME) {
            console.log("Borrando caché viejo:", key);
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/.netlify/") || url.pathname.startsWith("/data/")) {
    event.respondWith(fetch(req));
    return;
  }

  // Network First para ver cambios en desarrollo/preview
  event.respondWith(
    fetch(req).then((networkRes) => {
      const clone = networkRes.clone();
      caches.open(CACHE_NAME).then((c) => c.put(req, clone));
      return networkRes;
    }).catch(() => caches.match(req))
  );
});
