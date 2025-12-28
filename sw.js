// --- VERSIÓN MAESTRA V14 (Fix Transparencia) ---
const SW_VERSION = "score-store-v14-transparent-fix"; 

const CACHE_STATIC = `${SW_VERSION}-static`;
const CACHE_DYNAMIC = `${SW_VERSION}-dynamic`;

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
  "/assets/logo-score.webp",
  "/assets/hero.webp",
  "/assets/icons-score.svg",
  "/assets/fondo-pagina-score.webp"
];

// 1. INSTALACIÓN
self.addEventListener("install", (event) => {
  self.skipWaiting(); // Activar inmediatamente sin esperar
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(STATIC_ASSETS))
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
  self.clients.claim();
});

// 3. ESTRATEGIA DE RED (NETWORK FIRST)
// Esto soluciona que "no se ven los cambios". Siempre intenta ir a internet primero.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignorar API y Stripe
  if (url.pathname.startsWith("/.netlify/") || url.hostname.includes("stripe")) return;

  // ESTRATEGIA: Network First (Red primero, caer a caché si no hay internet)
  // Ideal para el Catálogo JSON y el HTML, así siempre ven precios/fotos nuevas.
  event.respondWith(
    fetch(req)
      .then((res) => {
        return caches.open(CACHE_DYNAMIC).then((cache) => {
          cache.put(req, res.clone());
          return res;
        });
      })
      .catch(() => {
        return caches.match(req); // Si falla internet, mostrar caché
      })
  );
});