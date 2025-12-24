// CAMBIAMOS A v10 PARA FORZAR LA ACTUALIZACIÓN EN TODOS LOS CELULARES
const SW_VERSION = "score-store-v10"; 
const CACHE_STATIC = `${SW_VERSION}-static`;
const CACHE_RUNTIME = `${SW_VERSION}-runtime`;

// Lista exacta de archivos vitales
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
  "/robots.txt",
  "/site.webmanifest",
  "/assets/logo-score.webp",
  "/assets/icons-score.svg",
  "/assets/hero.webp",
  "/assets/fondo-pagina-score.webp"
];

// 1. INSTALACIÓN: Guardamos lo básico
self.addEventListener("install", (event) => {
  self.skipWaiting(); // Fuerza al SW a activarse de inmediato
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

// 2. ACTIVACIÓN: Borramos cachés viejos (v9, v8, etc.)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => {
          // Si el caché no es el v10, lo borramos
          if (k.startsWith("score-store-") && k !== CACHE_STATIC && k !== CACHE_RUNTIME) {
            return caches.delete(k);
          }
        })
      )
    )
  );
  self.clients.claim(); // Toma control de la página inmediatamente
});

// 3. ESTRATEGIA DE RED (Inteligente)
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // A) IGNORAR: API de Netlify y Stripe (Nunca cachear)
  if (url.pathname.startsWith("/.netlify/") || url.pathname.includes("api") || url.hostname.includes("stripe")) {
    return; 
  }

  // B) CATÁLOGO (JSON): Stale-While-Revalidate
  // (Muestra el dato guardado RÁPIDO, pero busca actualizaciones en fondo)
  if (url.pathname.endsWith(".json")) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkFetch = fetch(req).then((res) => {
          caches.open(CACHE_RUNTIME).then((cache) => cache.put(req, res.clone()));
          return res;
        });
        return cached || networkFetch;
      })
    );
    return;
  }

  // C) ASSETS (Imágenes, JS, CSS): Cache First
  // (Si ya lo tengo, no lo pido a internet. Velocidad máxima)
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/js/") || url.pathname.startsWith("/css/")) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          // Si es válido, lo guardamos
          if (res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_RUNTIME).then((cache) => cache.put(req, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // D) DEFAULT (HTML y otros): Network First con caída a Caché
  event.respondWith(
    fetch(req)
      .catch(() => caches.match(req) || caches.match("/index.html"))
  );
});
