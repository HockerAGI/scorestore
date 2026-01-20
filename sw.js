/* sw.js - VERSIÓN DE PRODUCCIÓN v25 (SINCRONIZADA) */
const CACHE_NAME = "score-store-v25";

const ASSETS = [
  "/",
  "/index.html",
  "/legal.html",
  "/css/styles.css",
  "/js/main.js",
  "/data/catalog.json",
  "/assets/logo-score.webp",
  "/assets/icons/icon-192.png",
  "/site.webmanifest"
];

// Helper: cachear lo que se pueda, sin romper si falta algún asset opcional
async function safePrecache(cache, urls) {
  await Promise.allSettled(
    urls.map(async (url) => {
      try {
        const req = new Request(url, { cache: 'reload' });
        const res = await fetch(req);
        if (res.ok) await cache.put(req, res);
      } catch (e) {
        console.warn(`[SW] Skip asset: ${url}`);
      }
    })
  );
}

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => safePrecache(cache, ASSETS))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // 1. Ignorar llamadas a Backend / API externas (siempre red)
  if (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("stripe.com") ||
    url.pathname.includes("/.netlify/functions") ||
    url.pathname.includes("/api/")
  ) {
    return;
  }

  // 2. Solo GET
  if (req.method !== "GET") return;

  const isHTML = req.headers.get("accept")?.includes("text/html");
  const isData = url.pathname.includes("/data/");

  // 3. Estrategia Network First (para HTML y JSON de productos)
  // Queremos que el catálogo siempre esté fresco.
  if (isHTML || isData) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          return res;
        })
        .catch(async () => {
          // Si falla la red, usar caché
          const cached = await caches.match(req);
          if (cached) return cached;
          // Fallback offline a index.html si es navegación
          if (isHTML) return caches.match("/index.html");
        })
    );
    return;
  }

  // 4. Estrategia Cache First (Imágenes, CSS, JS estático)
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
