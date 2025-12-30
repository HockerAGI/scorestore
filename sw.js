// sw.js — SCORE STORE (PROD FINAL v5.1)
const CACHE_VERSION = "v5.1";
const CACHE_NAME = `score-static-${CACHE_VERSION}`;

const STATIC_PRECACHE = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/main.js",
  "/site.webmanifest",
  "/assets/logo-score.webp",
  "/assets/hero.webp",
  "/assets/fondo-pagina-score.webp"
];

// ---------- INSTALL ----------
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_PRECACHE))
  );
});

// ---------- ACTIVATE ----------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ---------- FETCH ----------
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // externos (Stripe/Fonts/etc.)
  if (url.origin !== self.location.origin) return;

  // APIs (Netlify/Vercel) — JAMÁS cachear
  if (url.pathname.startsWith("/.netlify/functions/")) return;
  if (url.pathname.startsWith("/api/")) return;

  // data dinámica — siempre red
  if (url.pathname.startsWith("/data/")) {
    event.respondWith(fetch(req));
    return;
  }

  const accept = req.headers.get("accept") || "";
  const isHTML = accept.includes("text/html");
  const isJS = url.pathname.endsWith(".js");
  const isCSS = url.pathname.endsWith(".css");
  const isJSON = url.pathname.endsWith(".json");

  // HTML/CSS/JS/JSON => NETWORK FIRST (evita “fantasmas”)
  if (isHTML || isJS || isCSS || isJSON) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // assets => CACHE FIRST
  if (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/css/")
  ) {
    event.respondWith(caches.match(req).then((c) => c || fetch(req)));
    return;
  }

  // default
  event.respondWith(fetch(req));
});