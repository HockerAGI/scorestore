// --- VERSIÓN MAESTRA V15 (Actualizada para Backend Netlify) ---
const SW_VERSION = "score-store-v15-netlify-fix"; 

const CACHE_STATIC = `${SW_VERSION}-static`;
const CACHE_DYNAMIC = `${SW_VERSION}-dynamic`;

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
  "/site.webmanifest",
  "/assets/logo-score.webp",
  "/assets/hero.webp",
  "/assets/icons-score.svg",
  "/assets/fondo-pagina-score.webp"
];

// 1. INSTALACIÓN
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(STATIC_ASSETS))
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
  self.clients.claim();
});

// 3. ESTRATEGIA: NETWORK FIRST (Prioridad Internet)
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // NO cachear API del backend (cotizaciones, pagos) ni Stripe
  if (url.pathname.startsWith("/.netlify/") || url.hostname.includes("stripe")) {
    return; 
  }

  // Para todo lo demás: Intenta internet, si falla, usa caché
  event.respondWith(
    fetch(req)
      .then((res) => {
        return caches.open(CACHE_DYNAMIC).then((cache) => {
          cache.put(req, res.clone());
          return res;
        });
      })
      .catch(() => {
        return caches.match(req);
      })
  );
});
