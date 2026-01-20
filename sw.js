/* sw.js - SCORE STORE v8.0 (FINAL PRODUCTION) */
const CACHE_NAME = "score-store-v8-final";

// Assets críticos que la App necesita para funcionar offline o cargar rápido
const ASSETS = [
  "/",
  "/index.html",
  "/legal.html",
  "/css/styles.css?v=8.0", // Versión forzada para asegurar diseño correcto
  "/js/main.js?v=8.0",     // Versión forzada para asegurar slider e integraciones
  "/data/catalog.json",
  "/assets/logo-score.webp",
  "/assets/icons/icon-192.png",
  "/assets/hero.webp",
  "/site.webmanifest"
];

// 1. INSTALACIÓN: Guardar assets nuevos
self.addEventListener("install", (e) => {
  self.skipWaiting(); // Forzar activación inmediata (Toma el control ya)
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Usamos Promise.allSettled para robustez: si falta una imagen, no rompe todo el SW
      return Promise.allSettled(
        ASSETS.map(url => {
          return fetch(url).then(res => {
            if (res.ok) return cache.put(url, res);
          });
        })
      );
    })
  );
});

// 2. ACTIVACIÓN: Limpieza profunda de cachés viejos (v5, v6, v7...)
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim(); // Reclamar control de pestañas abiertas
});

// 3. INTERCEPTOR DE RED (Estrategia Híbrida Inteligente)
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // A. Backend y APIs externas: SIEMPRE RED (Nunca cachear ventas, pagos o pixel)
  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("stripe.com") ||
    url.pathname.includes("/.netlify/") ||
    url.pathname.includes("/api/") ||
    url.hostname.includes("facebook.com") ||
    url.hostname.includes("google-analytics.com") ||
    req.method !== "GET"
  ) {
    return; // Ir directo a la red sin tocar caché
  }

  // B. Navegación HTML y Datos JSON: Network First (Prioridad a contenido fresco)
  // Intentamos bajar lo nuevo. Si no hay internet, mostramos lo guardado.
  if (req.mode === "navigate" || url.pathname.includes(".json") || url.pathname.endsWith(".html")) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req)) // Fallback offline
    );
    return;
  }

  // C. Imágenes, CSS, JS: Cache First (Velocidad máxima)
  // Busca
