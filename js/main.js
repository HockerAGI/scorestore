/* =========================================================
   SCORE STORE — UNIFIED PRODUCTION ENGINE v2026 (360) — UPDATED (PROD)
   ✅ Netlify Functions: create_checkout / quote_shipping / chat
   ✅ Catálogo: prioriza Supabase VIEW public.catalog_products (RLS+grants safe)
   ✅ Detecta imágenes existentes y omite las que no (sin romper carousel)
   ✅ NO cambia nombres de productos (respeta espacios en name)
   ✅ Soporta rutas con espacios (las encodea al cargar imágenes)
   ✅ Envío: manda items [{id, sku, qty}] (ÚNICO OS ready)
   ✅ PWA: /?openCart=1 abre carrito automáticamente
   ========================================================= */

/* -----------------------
   1) CONFIG REAL (respeta claves)
------------------------ */
const CONFIG = {
  stripeKey:
    "pk_live_51STepg1ExTx11WqTGdkk68CLhZHqnBkIAzE2EacmhSR336HvR9nQY5dskyPWotJ6AExFjstC7C7wUTsOIIzRGols00hFSwI8yp",

  supabaseUrl: "https://lpbzndnavkbpxwnlbqgb.supabase.co",
  supabaseKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE",

  // ✅ IMPORTANTE: lee la VIEW hardened (no la tabla products)
  supabaseCatalogView: "catalog_products",

  endpoints: {
    checkout: "/.netlify/functions/create_checkout",
    quote: "/.netlify/functions/quote_shipping",
    ai: "/.netlify/functions/chat",

    apiCheckout: "/api/checkout",
    apiQuote: "/api/quote",
    apiChat: "/api/chat",
  },

  storageKey: "score_cart_2026",

  fallbackShippingMX: 250,
  fallbackShippingUS: 800,

  // catálogo oficial en JSON
  catalogUrl: "/data/catalog.json",

  // imagen fallback global (debe existir)
  fallbackImg: "/assets/hero.webp",

  // timeouts
  imgProbeTimeoutMs: 2200,
};

/* -----------------------
   2) Helpers
------------------------ */
const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);

const fmtMXN = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    Number(n || 0)
  );

const safeId = (s) => String(s || "").replace(/[^a-zA-Z0-9_-]/g, "");
const digitsOnly = (s) => String(s || "").replace(/\D+/g, "");
const clampQty = (n) => Math.max(1, Math.min(99, Math.round(Number(n) || 1)));

const escapeHtml = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function safeUrl(u) {
  const raw = String(u || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/")) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  return "";
}

// ✅ Maneja espacios en rutas (/assets/..../cafe oscuro.webp)
function urlEncodePathIfNeeded(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/")) {
    return raw
      .split("/")
      .map((seg, i) => (i === 0 ? seg : encodeURIComponent(seg)))
      .join("/");
  }
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      u.pathname = u.pathname
        .split("/")
        .map((seg, i) => (i === 0 ? seg : encodeURIComponent(seg)))
        .join("/");
      return u.toString();
    } catch {
      return raw;
    }
  }
  return raw;
}

async function fetchJSON(url, options = {}, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  } finally {
    clearTimeout(t);
  }
}

async function postJSON(url, payload, timeoutMs = 15000) {
  return fetchJSON(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    },
    timeoutMs
  );
}

/* ✅ limpia params sin romper otros (ej: source=pwa) */
function removeQueryParams(keys = []) {
  try {
    const url = new URL(window.location.href);
    let changed = false;

    (keys || []).forEach((k) => {
      if (url.searchParams.has(k)) {
        url.searchParams.delete(k);
        changed = true;
      }
    });

    if (!changed) return;
    const qs = url.searchParams.toString();
    const next = url.pathname + (qs ? `?${qs}` : "") + url.hash;
    history.replaceState({}, document.title, next);
  } catch {}
}

/* -----------------------
   3) Stripe Init (Live)
------------------------ */
let stripe = null;
function initStripe() {
  if (stripe) return stripe;
  if (window.Stripe && CONFIG.stripeKey) stripe = window.Stripe(CONFIG.stripeKey);
  return stripe;
}

/* -----------------------
   4) STATE
------------------------ */
const state = {
  cart: JSON.parse(localStorage.getItem(CONFIG.storageKey) || "[]"),
  products: [],
  sections: [],
  filter: "ALL",
  shipping: { mode: "pickup", quote: 0, label: "Pickup Tijuana (Gratis)" },
  __quoteTimer: null,
  __quoteInFlight: false,
  __socialTimer: null,
  __introDone: false,
  __imgOkCache: new Map(),
};

/* -----------------------
   5) AUDIO FX (WebAudio)
------------------------ */
let audioCtx = null;
const getAudioCtx = () => {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx();
  return audioCtx;
};

function playSound(type) {
  const ctx = getAudioCtx();
  if (!ctx || ctx.state === "closed") return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(ctx.destination);

  const now = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, now);

  if (type === "click") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.start(now);
    osc.stop(now + 0.1);
  } else if (type === "success") {
    osc.type = "triangle";
    osc.frequency.setValueAtTime(460, now);
    osc.frequency.linearRampToValueAtTime(820, now + 0.16);
    g.gain.exponentialRampToValueAtTime(0.11, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc.start(now);
    osc.stop(now + 0.29);
  } else {
    osc.type = "sine";
    osc.frequency.setValueAtTime(720, now);
    g.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    osc.start(now);
    osc.stop(now + 0.15);
  }
}

/* -----------------------
   6) TOAST
------------------------ */
function toast(msg, type = "info") {
  const t = $("#toast") || $(".toast");
  if (!t) return;
  t.textContent = String(msg || "");
  t.className = `toast show ${type}`;
  playSound("click");
  setTimeout(() => t.classList.remove("show"), 3000);
}

/* -----------------------
   7) IMAGES: detecta existentes (sin romper)
------------------------ */
function probeImage(url, timeoutMs = CONFIG.imgProbeTimeoutMs) {
  const uRaw = safeUrl(url);
  if (!uRaw) return Promise.resolve(false);

  const u = urlEncodePathIfNeeded(uRaw);
  if (state.__imgOkCache.has(u)) return Promise.resolve(!!state.__imgOkCache.get(u));

  return new Promise((resolve) => {
    const img = new Image();
    let done = false;

    const finish = (ok) => {
      if (done) return;
      done = true;
      state.__imgOkCache.set(u, !!ok);
      resolve(!!ok);
    };

    const t = setTimeout(() => finish(false), timeoutMs);

    img.onload = () => {
      clearTimeout(t);
      finish(true);
    };
    img.onerror = () => {
      clearTimeout(t);
      finish(false);
    };

    img.decoding = "async";
    img.loading = "eager";
    img.src = u;
  });
}

async function filterExistingImages(urls) {
  const unique = [...new Set((urls || []).map(safeUrl).filter(Boolean))].map(urlEncodePathIfNeeded);
  if (!unique.length) return [];
  const checks = await Promise.all(unique.map((u) => probeImage(u)));
  return unique.filter((u, i) => checks[i]);
}

async function getProductImagesSafe(p) {
  const candidates = [
    ...(Array.isArray(p.images) ? p.images : []),
    p.img,
  ].map(safeUrl).filter(Boolean);

  const ok = await filterExistingImages(candidates);
  if (ok.length) return ok;
  return [CONFIG.fallbackImg];
}

/* -----------------------
   8) CATALOGO (Supabase VIEW -> /data/catalog.json -> local)
------------------------ */
async function loadCatalog() {
  const grid = $("#productsGrid");
  if (grid) {
    grid.innerHTML =
      "<div style='grid-column:1/-1;text-align:center;opacity:.6'>Cargando inventario...</div>";
  }

  // 1) Supabase REST (VIEW hardened)
  try {
    const viewName = CONFIG.supabaseCatalogView || "catalog_products";
    const url = `${CONFIG.supabaseUrl}/rest/v1/${encodeURIComponent(viewName)}?select=*`;
    const res = await fetch(url, {
      headers: {
        apikey: CONFIG.supabaseKey,
        Authorization: `Bearer ${CONFIG.supabaseKey}`,
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        state.products = normalizeProducts(data);
        renderGrid(getFilteredProducts());
        return;
      }
    }
  } catch (e) {
    console.warn("[catalog] supabase view fail:", e);
  }

  // 2) catálogo oficial /data/catalog.json (sections + products)
  try {
    const { res, data } = await fetchJSON(CONFIG.catalogUrl, { cache: "no-store" }, 12000);
    if (res.ok) {
      const list = Array.isArray(data?.products) ? data.products : Array.isArray(data) ? data : [];
      if (Array.isArray(data?.sections)) state.sections = data.sections;
      if (list.length) {
        state.products = normalizeProducts(list);
        ensureSectionChipsFromCatalog();
        renderGrid(getFilteredProducts());
        return;
      }
    }
  } catch (e) {
    console.warn("[catalog] /data/catalog.json fail:", e);
  }

  // 3) local fallback
  state.products = normalizeProducts(getLocalCatalog());
  renderGrid(getFilteredProducts());
}

/* ✅ Backfill para carrito viejo: añade sku si no venía */
function syncCartSkusFromCatalog() {
  try {
    if (!Array.isArray(state.cart) || !state.cart.length) return;
    if (!Array.isArray(state.products) || !state.products.length) return;

    const byId = new Map(state.products.map((p) => [String(p.id), p]));
    let changed = false;

    state.cart.forEach((it) => {
      if (!it) return;
      if (!it.sku) {
        const p = byId.get(String(it.id || ""));
        if (p?.sku) {
          it.sku = String(p.sku);
          changed = true;
        }
      }
    });

    if (changed) localStorage.setItem(CONFIG.storageKey, JSON.stringify(state.cart || []));
  } catch {}
}

function normalizeProducts(list) {
  return (list || []).map((p, idx) => {
    const id = p?.id ?? p?.sku ?? `p${idx + 1}`;
    const name = String(p?.name || p?.title || "Producto");

    const rawImages = Array.isArray(p?.images) && p.images.length ? p.images : (p?.img ? [p.img] : []);
    const images = rawImages.map(safeUrl).filter(Boolean);

    return {
      id: String(id),
      sku: String(p?.sku || ""),
      sectionId: String(p?.sectionId || p?.section_id || p?.category || "ALL").toUpperCase(),
      subSection: String(p?.subSection || p?.sub_section || p?.type || "").trim(),
      name,
      baseMXN: Number(p?.baseMXN ?? p?.base_mxn ?? p?.price ?? 0),
      img: safeUrl(p?.img) || safeUrl(images[0]) || CONFIG.fallbackImg,
      images,
      sizes: Array.isArray(p?.sizes) && p.sizes.length ? p.sizes.map(String) : ["Unitalla"],
    };
  });
}

function getLocalCatalog() {
  return [
    { id: "p1", sectionId: "BAJA_1000", subSection: "Hoodies", name: "Baja 1000 Legacy Hoodie", baseMXN: 1200, img: "/assets/prod1.webp", images: ["/assets/prod1.webp"], sizes: ["S","M","L","XL"] },
    { id: "p2", sectionId: "BAJA_1000", subSection: "Camisetas", name: "Score International Tee", baseMXN: 650, img: "/assets/prod2.webp", images: ["/assets/prod2.webp"], sizes: ["S","M","L","XL"] },
    { id: "p3", sectionId: "BAJA_500", subSection: "Gorras", name: "Trophy Truck Cap", baseMXN: 800, img: "/assets/prod3.webp", images: ["/assets/prod3.webp"], sizes: ["Unitalla"] },
  ];
}

/* -----------------------
   9) FILTERS
------------------------ */
function normalizeStr(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesFilter(p, filter) {
  const f = String(filter || "ALL").toUpperCase();
  if (f === "ALL") return true;

  if (["BAJA_1000", "BAJA_500", "BAJA_400", "SF_250", "SF_250"].includes(f)) {
    return String(p.sectionId || "").toUpperCase() === f;
  }

  const sub = normalizeStr(p.subSection);
  if (f === "HOODIES") return sub.includes("hoodie") || sub.includes("sudadera");
  if (f === "TEES") return sub.includes("camiseta") || sub.includes("playera") || sub.includes("tee") || sub.includes("tank");
  if (f === "CAPS") return sub.includes("gorra") || sub.includes("cap");

  return true;
}

function getFilteredProducts() {
  return (state.products || []).filter((p) => matchesFilter(p, state.filter));
}

function ensureSectionChipsFromCatalog() {
  const filtersWrap = document.querySelector(".filters");
  if (!filtersWrap) return;
  if (!Array.isArray(state.sections) || !state.sections.length) return;

  const existing = new Set([...filtersWrap.querySelectorAll(".chip")].map((c) => String(c.dataset.filter || "").toUpperCase()));

  state.sections.forEach((s) => {
    const id = String(s?.id || "").toUpperCase();
    const title = String(s?.title || id).toUpperCase();
    if (!id || existing.has(id)) return;
    if (!["BAJA_1000", "BAJA_500", "BAJA_400", "SF_250"].includes(id)) return;

    const btn = document.createElement("button");
    btn.className = "chip";
    btn.type = "button";
    btn.dataset.filter = id;
    btn.textContent = title.replaceAll("_", " ");

    btn.addEventListener("click", () => {
      $$(".chip").forEach((ch) => ch.classList.remove("active"));
      btn.classList.add("active");
      state.filter = id;
      renderGrid(getFilteredProducts());
      playSound("click");
    });

    filtersWrap.appendChild(btn);
    existing.add(id);
  });
}

/* -----------------------
   10) RENDER GRID
------------------------ */
async function renderGrid(list) {
  const grid = $("#productsGrid");
  if (!grid) return;

  grid.innerHTML = "";

  if (!list || !list.length) {
    grid.innerHTML =
      "<div style='grid-column:1/-1;text-align:center;opacity:.6'>No hay productos en esta categoría.</div>";
    return;
  }

  for (const p of list) {
    const card = await buildProductCard(p);
    grid.appendChild(card);
  }
}

async function buildProductCard(p) {
  const pid = safeId(p.id);
  const card = document.createElement("div");
  card.className = "champItem card";

  const nameSafe = escapeHtml(p.name);
  const price = fmtMXN(p.baseMXN);

  const images = await getProductImagesSafe(p);
  const media = buildMediaHTML(images, nameSafe, pid);

  const sizes = (p.sizes && p.sizes.length ? p.sizes : ["Unitalla"]).map(String);

  const sizeSelectHTML = `
    <select id="size-${pid}" class="size-selector">
      ${sizes.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}
    </select>
  `;

  card.innerHTML = `
    <div class="card-texture"></div>
    ${media}
    <div class="cardBody" style="z-index:2; text-align:center; padding:10px; width:100%;">
      <div class="cardTitle" style="font-family:'Teko'; font-size:24px; line-height:1;">${nameSafe}</div>
      <div class="cardPrice" style="color:var(--score-red); font-weight:900; font-size:18px;">${price}</div>
      <div style="margin-top:8px; display:flex; justify-content:center;">
        ${sizeSelectHTML}
      </div>
    </div>
    <button class="card-btn" type="button" data-add="${pid}">AGREGAR</button>
    <div class="badge">OFFICIAL</div>
  `;

  card.querySelector(`[data-add="${pid}"]`)?.addEventListener("click", () => addToCart(p.id));

  const car = card.querySelector(".carousel");
  if (car) {
    car.addEventListener("scroll", () => updateDots(car, pid), { passive: true });
    requestAnimationFrame(() => updateDots(car, pid));
  }

  return card;
}

function buildMediaHTML(images, nameSafe, pid) {
  const list = (images || []).map((u) => urlEncodePathIfNeeded(u)).filter(Boolean);
  const finalList = list.length ? list : [CONFIG.fallbackImg];

  if (finalList.length > 1) {
    const slides = finalList
      .map(
        (src) =>
          `<div class="carousel-item"><img src="${src}" class="prodImg" loading="lazy" alt="${nameSafe}" width="420" height="525"></div>`
      )
      .join("");

    const dots = finalList.map((_, i) => `<div class="dot ${i === 0 ? "active" : ""}"></div>`).join("");

    return `
      <div class="cardMedia" style="position:relative; width:100%; overflow:hidden;">
        <div class="carousel" data-pid="${pid}" style="scroll-snap-type:x mandatory; overflow:auto; display:flex;">
          ${slides}
        </div>
        <div class="carousel-dots" id="dots-${pid}">
          ${dots}
        </div>
      </div>
    `;
  }

  const src = finalList[0] || CONFIG.fallbackImg;
  return `
    <div class="cardMedia" style="position:relative; width:100%; overflow:hidden;">
      <img src="${src}" class="prodImg" loading="lazy" alt="${nameSafe}" width="420" height="525" style="width:100%;height:auto;object-fit:cover;">
    </div>
  `;
}

function updateDots(carousel, pid) {
  const width = carousel.getBoundingClientRect().width || carousel.clientWidth || 1;
  const idx = Math.round((carousel.scrollLeft || 0) / width);
  const dotsContainer = document.getElementById(`dots-${pid}`);
  if (!dotsContainer) return;
  const dots = dotsContainer.querySelectorAll(".dot");
  dots.forEach((d, i) => (i === idx ? d.classList.add("active") : d.classList.remove("active")));
}

/* -----------------------
   11) CART
------------------------ */
function cartCountTotal() {
  return (state.cart || []).reduce((a, b) => a + clampQty(b.qty), 0);
}

function cartSubtotal() {
  return (state.cart || []).reduce((a, b) => a + Number(b.price || 0) * clampQty(b.qty), 0);
}

function saveCart() {
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(state.cart || []));

  const qty = cartCountTotal();
  const cc = $("#cartCount");
  if (cc) cc.textContent = String(qty);
  $$(".cartCount").forEach((el) => (el.textContent = String(qty)));

  updateDrawerUI();
}

function addToCart(id) {
  const p = (state.products || []).find((x) => String(x.id) === String(id));
  if (!p) return toast("Producto no disponible", "error");

  const pid = safeId(p.id);
  const size = $(`#size-${pid}`)?.value || "Unitalla";
  const key = `${p.id}-${size}`;

  const ex = state.cart.find((i) => i.key === key);

  const thumbCandidate =
    (Array.isArray(p.images) && p.images[0]) ? p.images[0] : p.img;

  const thumb = urlEncodePathIfNeeded(safeUrl(thumbCandidate) || CONFIG.fallbackImg);

  if (ex) ex.qty = clampQty(ex.qty + 1);
  else {
    state.cart.push({
      key,
      id: p.id,
      sku: p.sku || "",
      name: p.name,
      price: Number(p.baseMXN || 0),
      img: thumb || CONFIG.fallbackImg,
      size: String(size),
      qty: 1,
    });
  }

  if (state.shipping.mode !== "pickup") {
    state.shipping.quote = 0;
    state.shipping.label = "Recotizar envío";
  }

  playSound("success");
  saveCart();
  openDrawer();
  toast("Agregado al carrito", "success");
  requestMiniQuote();
}

function modQty(idx, delta) {
  if (!state.cart[idx]) return;

  const next = Number(state.cart[idx].qty) + Number(delta);
  if (next <= 0) state.cart.splice(idx, 1);
  else state.cart[idx].qty = clampQty(next);

  if (state.shipping.mode !== "pickup") {
    state.shipping.quote = 0;
    state.shipping.label = "Recotizar envío";
  }

  saveCart();
  requestMiniQuote();
}

function updateDrawerUI() {
  const box = $("#cartItems");
  if (!box) return;

  box.innerHTML = "";
  (state.cart || []).forEach((item, i) => {
    const row = document.createElement("div");
    row.className = "cart-card cartRow";

    row.innerHTML = `
      <img src="${urlEncodePathIfNeeded(safeUrl(item.img) || CONFIG.fallbackImg)}" alt="" style="width:60px; height:70px; object-fit:contain; background:#fff; border-radius:6px;">
      <div style="flex:1; margin-left:10px;">
        <div style="color:#fff; font-weight:900; font-size:14px;">${escapeHtml(item.name)}</div>
        <div style="color:#aaa; font-size:12px;">Talla: ${escapeHtml(item.size)}</div>
        <div style="color:var(--score-red); font-weight:900;">${fmtMXN(item.price)}</div>
        <div class="qty-ctrl" style="margin-top:5px; display:flex; gap:10px; align-items:center;">
           <button class="qtyBtn" type="button" style="color:#fff; background:rgba(255,255,255,0.1); width:24px; border-radius:4px;" aria-label="Menos">-</button>
           <span style="color:#fff; font-weight:900;">${clampQty(item.qty)}</span>
           <button class="qtyBtn" type="button" style="color:#fff; background:rgba(255,255,255,0.1); width:24px; border-radius:4px;" aria-label="Más">+</button>
        </div>
      </div>
    `;

    const btns = row.querySelectorAll(".qtyBtn");
    btns[0]?.addEventListener("click", () => modQty(i, -1));
    btns[1]?.addEventListener("click", () => modQty(i, +1));
    box.appendChild(row);
  });

  const sub = cartSubtotal();
  const ship = Number(state.shipping.quote || 0);
  const total = sub + ship;

  if ($("#cartSubtotal")) $("#cartSubtotal").textContent = fmtMXN(sub);

  if ($("#cartShipping")) {
    $("#cartShipping").textContent =
      state.shipping.mode === "pickup" ? "Gratis" : ship > 0 ? fmtMXN(ship) : "Pendiente";
  }

  const shipLabel = $("#cartShipLabel") || $("#miniShipLabel");
  if (shipLabel) {
    if (state.shipping.mode === "pickup") shipLabel.textContent = "Pickup Gratis";
    else shipLabel.textContent = state.shipping.label || (ship > 0 ? fmtMXN(ship) : "Cotiza envío");
  }

  const totalEl = $("#cartTotal");
  if (totalEl) totalEl.textContent = fmtMXN(total);
}

/* -----------------------
   12) DRAWER OPEN/CLOSE
------------------------ */
function openDrawer() {
  $("#cartDrawer")?.classList.add("active", "open");
  $("#pageOverlay")?.classList.add("active", "show");
  $(".page-overlay")?.classList.add("active", "show");
  $("#backdrop")?.classList.add("active", "show");
  document.body.classList.add("noScroll", "modalOpen");
  document.body.style.overflow = "hidden";
  saveCart();
}
function closeDrawer() {
  $("#cartDrawer")?.classList.remove("active", "open");
  $("#pageOverlay")?.classList.remove("active", "show");
  $(".page-overlay")?.classList.remove("active", "show");
  $("#backdrop")?.classList.remove("active", "show");
  document.body.classList.remove("noScroll", "modalOpen");
  document.body.style.overflow = "";
}
function openCart(){ openDrawer(); }
function closeCart(){ closeDrawer(); }

function handleOpenCartQuery() {
  try {
    const v = String(new URLSearchParams(window.location.search).get("openCart") || "").toLowerCase();
    if (v === "1" || v === "true" || v === "yes") {
      openDrawer();
      removeQueryParams(["openCart"]);
    }
  } catch {}
}

/* -----------------------
   13) SHIPPING
------------------------ */
function getShipModeFromUI() {
  const sel = $("#shippingMode");
  if (sel) return String(sel.value || "pickup");
  const checked = document.querySelector('input[name="shipMode"]:checked');
  return String(checked?.value || "pickup");
}

function toggleShipping(mode) {
  const m = String(mode || getShipModeFromUI() || "pickup").toLowerCase();
  state.shipping.mode = m;

  const zip = $("#miniZip");
  if (m === "pickup") {
    state.shipping.quote = 0;
    state.shipping.label = "Pickup Tijuana (Gratis)";
    if (zip) zip.style.display = "none";
  } else {
    state.shipping.quote = 0;
    state.shipping.label = "Ingresa CP y cotiza";
    if (zip) {
      zip.style.display = "block";
      zip.placeholder = m === "us" ? "ZIP Code (USA)" : "Código Postal (MX)";
    }
  }

  saveCart();
  requestMiniQuote();
}

function cartItemsForQuote() {
  const items = (state.cart || []).map((i) => ({
    id: String(i.id || ""),
    sku: String(i.sku || ""),
    qty: clampQty(i.qty),
  }));
  return items.length ? items : [{ qty: 1 }];
}

function modeToCountry(mode) {
  return String(mode || "mx").toLowerCase() === "us" ? "US" : "MX";
}

function requestMiniQuote() {
  clearTimeout(state.__quoteTimer);
  state.__quoteTimer = setTimeout(() => {
    const mode = getShipModeFromUI();
    const zip = digitsOnly($("#miniZip")?.value || "");
    if (mode === "pickup") return;
    if (zip.length < 4) return;
    quoteShippingMini().catch(() => {});
  }, 450);
}

async function quoteShippingMini() {
  if (state.__quoteInFlight) return;

  const mode = getShipModeFromUI();
  const zip = digitsOnly($("#miniZip")?.value || "");

  if (mode === "pickup") return;
  if (zip.length < 4) return toast("Ingresa un CP válido", "error");

  state.__quoteInFlight = true;
  const lbl = $("#miniShipLabel") || $("#cartShipLabel");
  if (lbl) lbl.textContent = "Cotizando...";

  try {
    const payload = { zip, country: modeToCountry(mode), items: cartItemsForQuote() };

    let res, data;
    ({ res, data } = await postJSON(CONFIG.endpoints.quote, payload, 16000));
    if (!res.ok) ({ res, data } = await postJSON(CONFIG.endpoints.apiQuote, payload, 16000));

    if (!data?.ok) throw new Error(data?.error || "QUOTE_FAILED");

    const cost = Number(data.cost || 0);
    const label = String(data.label || "Envío estimado");
    if (!cost) throw new Error("QUOTE_ZERO");

    state.shipping = { mode, quote: cost, label };
    saveCart();
    toast("Envío actualizado", "success");
    playSound("success");
  } catch (e) {
    console.warn("[quote] fallback:", e);
    const fallbackCost = mode === "us" ? CONFIG.fallbackShippingUS : CONFIG.fallbackShippingMX;
    state.shipping.quote = fallbackCost;
    state.shipping.label = "Envío (Estimación)";
    saveCart();
    toast("No se pudo cotizar en vivo. Usando estimación.", "info");
  } finally {
    state.__quoteInFlight = false;
  }
}

async function quoteShippingUI() {
  const country = ($("#shipCountry")?.value || "MX").toUpperCase();
  const zip = digitsOnly($("#shipZip")?.value || "");
  const out = $("#shipQuote");

  if (zip.length < 4) {
    if (out) out.textContent = "Ingresa un código postal válido.";
    return;
  }
  if (out) out.textContent = "Cotizando...";

  try {
    const payload = { zip, country, items: cartItemsForQuote() };
    let res, data;
    ({ res, data } = await postJSON(CONFIG.endpoints.quote, payload, 16000));
    if (!res.ok) ({ res, data } = await postJSON(CONFIG.endpoints.apiQuote, payload, 16000));

    if (!data?.ok) throw new Error(data?.error || "QUOTE_FAILED");

    const cost = Number(data.cost || 0);
    const label = String(data.label || "Envío estimado");
    if (!cost) throw new Error("QUOTE_ZERO");

    if (out) out.innerHTML = `<b>${escapeHtml(label)}</b> · ${fmtMXN(cost)}`;
    playSound("success");
  } catch (e) {
    console.warn("[quote-ui] fail:", e);
    if (out) out.textContent = "No se encontró tarifa. Intenta otro CP.";
  }
}

/* -----------------------
   14) CHECKOUT
------------------------ */
async function doCheckout() {
  if (!state.cart.length) return toast("Carrito vacío", "error");

  const mode = state.shipping.mode || getShipModeFromUI();
  const zip = digitsOnly($("#miniZip")?.value || "");

  if (mode !== "pickup") {
    if (zip.length < 4) return toast("Ingresa tu CP/ZIP", "error");
    if (!state.shipping.quote) return toast("Cotiza el envío primero", "error");
  }

  const btn = $("#checkoutBtn");
  const original = btn?.innerHTML || "PAGAR AHORA";
  if (btn) {
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> PROCESANDO...';
    btn.disabled = true;
  }

  try {
    initStripe();

    const payload = {
      cart: state.cart,
      shipping: state.shipping,
      shippingMode: mode,
      shippingData: { postal_code: zip },
      cancel_url: window.location.href,
      success_url: window.location.origin + "/?status=success",
      promoCode: "",
    };

    let res, data;
    ({ res, data } = await postJSON(CONFIG.endpoints.checkout, payload, 20000));
    if (!res.ok) ({ res, data } = await postJSON(CONFIG.endpoints.apiCheckout, payload, 20000));

    if (!res.ok) throw new Error(data?.error || "CHECKOUT_HTTP_" + res.status);

    const directUrl = data?.url ? String(data.url) : "";
    const sessionId = data?.id || data?.sessionId;

    if (directUrl) {
      window.location.href = directUrl;
      return;
    }
    if (sessionId && stripe) {
      const result = await stripe.redirectToCheckout({ sessionId: String(sessionId) });
      if (result?.error) throw new Error(result.error.message);
      return;
    }

    throw new Error(data?.error || "CHECKOUT_FAILED");
  } catch (e) {
    console.error(e);
    toast("Error en pago. Intenta de nuevo.", "error");
    if (btn) {
      btn.innerHTML = original;
      btn.disabled = false;
    }
  }
}

/* -----------------------
   15) AI
------------------------ */
function toggleAiAssistant() {
  const modal = $("#aiChatModal") || $(".ai-chat-modal");
  if (!modal) return;
  modal.classList.toggle("active");
  modal.classList.toggle("show");
}

async function sendAiMessage() {
  const input = $("#aiInput") || $(".ai-input");
  const box = $("#aiMessages") || document.querySelector(".ai-body");
  if (!input || !box) return;

  const text = String(input.value || "").trim();
  if (!text) return;

  const me = document.createElement("div");
  me.className = "ai-bubble user ai-msg ai-me";
  me.textContent = text;
  box.appendChild(me);
  box.scrollTop = box.scrollHeight;
  input.value = "";

  try {
    let res, data;
    ({ res, data } = await postJSON(CONFIG.endpoints.ai, { message: text }, 20000));
    if (!res.ok) ({ res, data } = await postJSON(CONFIG.endpoints.apiChat, { message: text }, 20000));
    const reply = String(data?.reply || data?.message || "Listo. ¿Qué necesitas ajustar?");

    const bot = document.createElement("div");
    bot.className = "ai-bubble bot ai-msg ai-bot";
    bot.textContent = reply;
    box.appendChild(bot);
    box.scrollTop = box.scrollHeight;
  } catch {
    const bot = document.createElement("div");
    bot.className = "ai-bubble bot ai-msg ai-bot";
    bot.textContent = "Estoy en modo offline. Conecta el endpoint AI para respuestas en vivo.";
    box.appendChild(bot);
    box.scrollTop = box.scrollHeight;
  }
}

function bindAiEnter() {
  const input = $("#aiInput") || $(".ai-input");
  if (!input) return;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendAiMessage();
    }
  });
}

/* -----------------------
   16) LEGAL
------------------------ */
function openLegal(type) {
  const modal = $("#legalModal");
  if (!modal) return;

  const title = $("#legalTitle");
  const body = $("#legalBody");

  const lib = window.LEGAL_CONTENT || {};
  const FALLBACK = {
    privacy: { title: "AVISO DE PRIVACIDAD", html: "<p>Tu información se usa únicamente para procesar tu pedido y brindarte soporte.</p>" },
    terms: { title: "TÉRMINOS Y CONDICIONES", html: "<p>Al comprar aceptas políticas de venta, tiempos de producción, envíos y devoluciones.</p>" },
    contact: { title: "CONTACTO", html: "<p><b>Email:</b> ventas.unicotextil@gmail.com</p>" },
  };

  const key = String(type || "privacy").trim();
  const item = lib[key] || FALLBACK[key] || FALLBACK.privacy;

  if (title) title.textContent = item.title || "Info";
  if (body) body.innerHTML = item.html || "<p>Contenido no disponible.</p>";

  modal.classList.add("active", "show");
  document.body.classList.add("modalOpen", "noScroll");
}

function closeLegal() {
  $("#legalModal")?.classList.remove("active", "show");
  document.body.classList.remove("modalOpen", "noScroll");
}

/* -----------------------
   17) COOKIES
------------------------ */
function acceptCookies() {
  const b = $("#cookieBanner") || $(".cookieBanner");
  if (b) b.style.display = "none";
  localStorage.setItem("score_cookies", "accepted");
  localStorage.setItem("score_cookie_consent", "all");
}

/* -----------------------
   18) INTRO/SPLASH + SOCIAL + SW
------------------------ */
function initIntroSplash() {
  const intro = $("#intro");
  const skip = $("#introSkip");
  if (intro) {
    const hide = () => {
      if (state.__introDone) return;
      state.__introDone = true;
      intro.classList.add("hide");
      setTimeout(() => intro.remove(), 420);
    };
    skip?.addEventListener("click", hide);
    setTimeout(hide, 1200);
  }

  const splash = $("#splash-screen");
  const bar = $(".rpm-bar");
  const rpm = $("#revCounter");
  if (splash && bar) {
    let p = 0;
    const tick = setInterval(() => {
      p = Math.min(100, p + (Math.random() * 14 + 6));
      bar.style.width = p.toFixed(0) + "%";
      if (rpm) rpm.textContent = Math.min(9000, Math.floor(p * 90)) + " RPM";
      if (p >= 100) {
        clearInterval(tick);
        splash.style.opacity = "0";
        splash.style.visibility = "hidden";
        setTimeout(() => splash.remove?.(), 600);
      }
    }, 120);
  }
}

function initSocialProof() {
  const names = ["Alberto", "Mariana", "Roberto", "Carlos", "Juan", "Fernanda", "Sofía", "Diego"];
  const locs = ["Tijuana", "Ensenada", "San Diego", "Mexicali", "Rosarito", "Tecate"];
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const show = () => {
    const cartOpen = $("#cartDrawer")?.classList.contains("open") || $("#cartDrawer")?.classList.contains("active");
    const aiOpen = $("#aiChatModal")?.classList.contains("show") || $("#aiChatModal")?.classList.contains("active");
    if (cartOpen || aiOpen) return;
    toast(`🏁 ${pick(names)} de ${pick(locs)} armó su pedido oficial.`, "info");
  };

  clearInterval(state.__socialTimer);
  setTimeout(show, 18000);
  state.__socialTimer = setInterval(show, 42000);
}

function initServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost") return;
  navigator.serviceWorker.register("/sw.js?v=2026_PROD_UNIFIED_360").catch(() => {});
}

/* -----------------------
   19) BOOT
------------------------ */
function bindUI() {
  $(".cartBtn")?.addEventListener("click", openDrawer);
  $("#cartBtn")?.addEventListener("click", openDrawer);

  $(".page-overlay")?.addEventListener("click", closeDrawer);
  $("#pageOverlay")?.addEventListener("click", closeDrawer);
  $("#backdrop")?.addEventListener("click", closeDrawer);

  $(".closeBtn")?.addEventListener("click", closeDrawer);
  $(".drawerClose")?.addEventListener("click", closeDrawer);

  $("#checkoutBtn")?.addEventListener("click", doCheckout);

  $(".ai-btn-float")?.addEventListener("click", toggleAiAssistant);
  $(".ai-send")?.addEventListener("click", sendAiMessage);
  bindAiEnter();

  $$(".jsLegalLink").forEach((btn) =>
    btn.addEventListener("click", () => openLegal(btn.dataset.legal || "privacy"))
  );
  $("#legalClose")?.addEventListener("click", closeLegal);
  $("#legalBackdrop")?.addEventListener("click", closeLegal);

  $$(".chip").forEach((c) => {
    if (c.__bound) return;
    c.__bound = true;
    c.addEventListener("click", () => {
      $$(".chip").forEach((ch) => ch.classList.remove("active"));
      c.classList.add("active");
      state.filter = c.dataset.filter || "ALL";
      renderGrid(getFilteredProducts());
      playSound("click");
    });
  });

  $("#shippingMode")?.addEventListener("change", (e) => toggleShipping(e.target.value));
  $("#miniZip")?.addEventListener("input", requestMiniQuote);

  document.querySelectorAll('input[name="shipMode"]').forEach((r) => {
    r.addEventListener("change", () => toggleShipping(r.value));
  });

  $("#shipZip")?.addEventListener("input", () => {
    const v = digitsOnly($("#shipZip")?.value || "");
    if (v.length >= 4) {
      clearTimeout(window.__shipUiDeb);
      window.__shipUiDeb = setTimeout(() => quoteShippingUI().catch?.(() => {}), 450);
    }
  });
  $("#shipCountry")?.addEventListener("change", () => {
    const v = digitsOnly($("#shipZip")?.value || "");
    if (v.length >= 4) quoteShippingUI().catch?.(() => {});
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeLegal();
    const ai = $("#aiChatModal") || $(".ai-chat-modal");
    ai?.classList.remove("active", "show");
    closeDrawer();
  });

  if (localStorage.getItem("score_cookies") === "accepted" || localStorage.getItem("score_cookie_ok") === "1") {
    const b = $("#cookieBanner") || $(".cookieBanner");
    if (b) b.style.display = "none";
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("status") === "success") {
    toast("¡Pago confirmado! 🏁", "success");
    state.cart = [];
    saveCart();
    removeQueryParams(["status"]);
  } else if (params.get("status") === "cancel") {
    toast("Pago cancelado", "info");
    removeQueryParams(["status"]);
  }
}

/* -----------------------
   20) DOM READY
------------------------ */
document.addEventListener("DOMContentLoaded", async () => {
  initStripe();
  initIntroSplash();

  await loadCatalog();
  syncCartSkusFromCatalog();

  toggleShipping(getShipModeFromUI());

  bindUI();
  saveCart();

  handleOpenCartQuery();

  initSocialProof();
  initServiceWorker();
});

/* -----------------------
   21) EXPORTS legacy
------------------------ */
window.addToCart = addToCart;
window.modQty = modQty;

window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.openCart = openCart;
window.closeCart = closeCart;

window.toggleShipping = toggleShipping;
window.quoteShipping = quoteShippingMini;
window.quoteShippingMini = quoteShippingMini;
window.quoteShippingUI = quoteShippingUI;

window.doCheckout = doCheckout;
window.checkout = doCheckout;

window.toggleAiAssistant = toggleAiAssistant;
window.sendAiMessage = sendAiMessage;

window.openLegal = openLegal;
window.closeLegal = closeLegal;

window.acceptCookies = acceptCookies;

window.__score_encodePath = urlEncodePathIfNeeded;
window.__score_probeImage = probeImage;