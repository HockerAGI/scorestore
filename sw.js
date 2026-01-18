/* sw.js - VERSIÓN DE PRODUCCIÓN v21 (FIXED + CONSISTENTE) */
const CACHE_NAME = "score-store-v21";

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

// helper: agrega assets sin romper instalación si alguno falla
async function safePrecache(cache, urls) {
  await Promise.allSettled(
    urls.map(async (url) => {
      try {
        await cache.add(url);
      } catch (e) {
        // no rompas install por un asset faltante
        // (ej: legal.html no existe aún, o icon missing)
      }
    })
  );
}

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await safePrecache(cache, ASSETS);
    })
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
  const url = req.url || "";

  // Ignorar backend / proveedores: datos frescos SIEMPRE
  if (
    url.includes("supabase.co") ||
    url.includes("stripe.com") ||
    url.includes("/.netlify/functions") ||
    url.includes("/api/")
  ) {
    return;
  }

  if (req.method !== "GET") return;

  const isHTML =
    req.destination === "document" ||
    (req.headers.get("accept") || "").includes("text/html");

  const isData = url.includes("/data/");

  // Network First para HTML y data JSON (catálogo fresco)
  if (isHTML || isData) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          // fallback navegación offline al home si existe
          return caches.match("/index.html");
        })
    );
    return;
  }

  // Cache First para assets
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});