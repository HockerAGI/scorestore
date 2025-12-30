// sw.js — SCORE STORE (v5 FINAL)

const CACHE = "score-v5";

const PRECACHE = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
  "/site.webmanifest",

  // Core
  "/assets/logo-score.webp",
  "/assets/hero.webp",
  "/assets/fondo-pagina-score.webp",
  "/assets/baja1000-texture.webp",

  // Logos reales (usa los nombres EXACTOS que existen)
  "/assets/logo-baja1000.webp",
  "/assets/logo-baja500.webp",
  "/assets/logo-baja400.webp",
  "/assets/logo-sf250.webp",
  "/assets/logo-unico.webp",
  "/assets/logo-world-desert.webp",
  "/assets/logo-ford.webp",
  "/assets/logo-rzr.webp",
  "/assets/logo-bfgodrich.webp"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Solo GET
  if (req.method !== "GET") return;

  // Externos (Stripe, etc.)
  if (url.origin !== location.origin) return;

  // Netlify Functions
  if (url.pathname.startsWith("/.netlify/functions")) return;

  // Data dinámica
  if (url.pathname.startsWith("/data/")) {
    e.respondWith(fetch(req));
    return;
  }

  // HTML / JS / JSON → NETWORK FIRST
  if (
    req.headers.get("accept")?.includes("text/html") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".json")
  ) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Assets → CACHE FIRST
  if (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/css/")
  ) {
    e.respondWith(caches.match(req).then((c) => c || fetch(req)));
    return;
  }

  e.respondWith(fetch(req));
});