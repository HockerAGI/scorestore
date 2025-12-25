// --- SCORE STORE SERVICE WORKER ---
// Versión: V15 (Incrementada para forzar borrado de la versión rota)
const SW_VERSION = "score-store-v15-FIXED"; 

const CACHE_STATIC = `${SW_VERSION}-static`;
const CACHE_DYNAMIC = `${SW_VERSION}-dynamic`;

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/css/styles.css",  
  "/js/main.js",      
  "/site.webmanifest",
  "/icons-score.svg",
  "/assets/logo-score.webp",
  "/assets/hero.webp",
  "/assets/logo-baja1000.webp"
];

// 1. INSTALACIÓN
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then((cache) => {
        // Cacheamos lo que coincida con la lista
        return cache.addAll(STATIC_ASSETS);
      })
      .catch(err => console.error('[SW] Error install:', err))
  );
});

// 2. ACTIVACIÓN (Limpieza)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((k) => {
        if (k !== CACHE_STATIC && k !== CACHE_DYNAMIC) {
          return caches.delete(k);
        }
      })
    ))
  );
  return self.clients.claim();
});

// 3. FETCH
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignorar API y Stripe
  if (url.pathname.startsWith("/.netlify/") || url.hostname.includes("stripe")) return;
  if (req.method !== "GET") return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_DYNAMIC).then((cache) => cache.put(req, resClone));
        return res;
      })
      .catch(() => {
        return caches.match(req);
      })
  );
});
