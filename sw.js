// sw.js — SCORE STORE (UPDATED PROD)
// Cache Version Bump to force update
const CACHE_VERSION = "v25.0_FORCE";
const CACHE_NAME = `score-static-${CACHE_VERSION}`;

const PRECACHE = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
  "/site.webmanifest",
  // Assets visuales clave
  "/assets/logo-score.webp",
  "/assets/hero.webp",
  "/assets/fondo-pagina-score.webp",
  "/assets/baja1000-texture.webp" 
];

// INSTALACIÓN: Precarga crítica
self.addEventListener("install", (event) => {
  self.skipWaiting(); // Forza al SW a activarse de inmediato
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Intentamos cachear, si falla uno no detiene a los demás
      await Promise.all(
        PRECACHE.map(async (u) => {
          try { await cache.add(new Request(u, { cache: "reload" })); } catch (_) {}
        })
      );
    })()
  );
});

// ACTIVACIÓN: Limpieza de cachés viejos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Tomar control de todos los clientes inmediatamente
      await self.clients.claim();
      
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => {
          if (k.startsWith("score-static-") && k !== CACHE_NAME) {
            console.log("Limpiando caché viejo:", k);
            return caches.delete(k);
          }
        })
      );
    })()
  );
});

// FETCH: Estrategia Network-First para contenido, Cache-First para imágenes
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignorar métodos no-GET y otros orígenes
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Ignorar funciones serverless y data dinámica
  if (url.pathname.startsWith("/.netlify/functions") || url.pathname.startsWith("/data/")) {
    event.respondWith(fetch(req));
    return;
  }

  // Archivos críticos (HTML, CSS, JS) -> Intentar Red primero (para ver cambios), luego Cache
  const isCritical = 
    req.headers.get("accept")?.includes("text/html") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".json");

  if (isCritical) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Si la red responde, actualizamos el caché y devolvemos
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req)) // Si falla red, usamos caché
    );
    return;
  }

  // Imágenes y Assets -> Cache primero (velocidad), luego Red
  event.respondWith(
    caches.match(req).then((cached) => {
      return cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      });
    })
  );
});
