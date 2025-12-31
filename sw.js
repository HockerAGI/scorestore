// sw.js — FORCE UPDATE v35 (CACHE BUSTER)
const CACHE_VERSION = "v35_FORCE_RESET";
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

// INSTALACIÓN: Forzar espera
self.addEventListener("install", (event) => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Intentamos cachear, si falla algo no rompemos todo
      return Promise.all(
        PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" })).catch(err => console.log(err)))
      );
    })
  );
});

// ACTIVACIÓN: Borrar cachés viejos agresivamente
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => 
      Promise.all(
        keys.map((key) => {
          if (key.startsWith("score-static-") && key !== CACHE_NAME) {
            console.log("Limpiando caché viejo:", key);
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

// FETCH: Network First para ver cambios
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignorar API y POST
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/.netlify/") || url.pathname.startsWith("/data/")) return;

  // Estrategia: Red primero, luego caché (para desarrollo y cambios rápidos)
  event.respondWith(
    fetch(req).then((networkRes) => {
      const clone = networkRes.clone();
      caches.open(CACHE_NAME).then((c) => c.put(req, clone));
      return networkRes;
    }).catch(() => caches.match(req))
  );
});
