// --- VERSIÓN MAESTRA V12 ---
// Cambia este número SIEMPRE que hagas cambios importantes para forzar la actualización en los celulares.
const SW_VERSION = "score-store-v12-force-update"; 

const CACHE_STATIC = `${SW_VERSION}-static`;
const CACHE_DYNAMIC = `${SW_VERSION}-dynamic`;

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
  "/site.webmanifest",      // AGREGADO: Vital para que la app se instale bien
  "/assets/logo-score.webp",
  "/assets/hero.webp",
  "/icons-score.svg",       // CORREGIDO: Estaba en /assets/ y es root
  "/assets/fondo-pagina-score.webp"
];

// 1. INSTALACIÓN
self.addEventListener("install", (event) => {
  self.skipWaiting(); // Activar inmediatamente
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then((cache) => {
        console.log('[SW] Pre-caching archivos estáticos');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch((err) => console.error('[SW] Error en caché estática:', err))
  );
});

// 2. ACTIVACIÓN (Limpieza agresiva de versiones viejas)
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

// 3. ESTRATEGIA DE RED (NETWORK FIRST)
// Ideal para Ecommerce: Siempre intenta bajar la versión nueva.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignorar API, Stripe y Admin
  if (url.pathname.startsWith("/.netlify/") || url.hostname.includes("stripe")) return;

  // Solo interceptar peticiones GET (imágenes, scripts, html)
  if (req.method !== "GET") return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Si la red responde bien, guardamos copia fresca en caché y la entregamos
        const resClone = res.clone();
        caches.open(CACHE_DYNAMIC).then((cache) => {
          cache.put(req, resClone);
        });
        return res;
      })
      .catch(() => {
        // Si falla internet, buscamos en caché
        return caches.match(req).then((cachedRes) => {
          if (cachedRes) return cachedRes;
          // Si no está en caché y es una navegación, podríamos devolver una página offline.html (opcional)
        });
      })
  );
});