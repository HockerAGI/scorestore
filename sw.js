// --- SCORE STORE SERVICE WORKER ---
// CAMBIA ESTE VALOR EN CADA DESPLIEGUE PARA FORZAR ACTUALIZACIÓN EN CELULARES
const SW_VERSION = "score-store-v14-LIGHT-LAUNCH"; 

const CACHE_STATIC = `${SW_VERSION}-static`;
const CACHE_DYNAMIC = `${SW_VERSION}-dynamic`;

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/css/styles.css?v=14.0",
  "/js/main.js?v=14.0",
  "/site.webmanifest",
  "/icons-score.svg",
  "/assets/logo-score.webp",
  "/assets/hero.webp",
  "/assets/logo-baja1000.webp"
];

// 1. INSTALACIÓN (Precarga lo vital)
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then((cache) => {
        console.log('[SW] Cacheando assets estáticos:', SW_VERSION);
        return cache.addAll(STATIC_ASSETS);
      })
      .catch(err => console.error('[SW] Error install:', err))
  );
});

// 2. ACTIVACIÓN (Borra versiones viejas sin piedad)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((k) => {
        if (k !== CACHE_STATIC && k !== CACHE_DYNAMIC) {
          console.log('[SW] Borrando caché vieja:', k);
          return caches.delete(k);
        }
      })
    ))
  );
  return self.clients.claim();
});

// 3. FETCH (Estrategia: Network First para contenido fresco)
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignorar llamadas a API, Stripe y Admin
  if (url.pathname.startsWith("/.netlify/") || url.hostname.includes("stripe.com")) return;

  // Solo GET
  if (req.method !== "GET") return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Si hay internet, guardamos copia fresca
        const resClone = res.clone();
        caches.open(CACHE_DYNAMIC).then((cache) => cache.put(req, resClone));
        return res;
      })
      .catch(() => {
        // Si falla internet, usamos caché
        return caches.match(req).then((cached) => {
          if (cached) return cached;
          // Si no hay caché ni internet, y es navegación, podríamos mostrar offline.html
          // if (req.headers.get("accept").includes("text/html")) return caches.match("/offline.html");
        });
      })
  );
});