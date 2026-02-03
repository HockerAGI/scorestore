/* =========================================================
   SCORE STORE — UNIFIED PRODUCTION ENGINE v2026 (360) — UPDATED (PROD)
   ✅ Netlify Functions: create_checkout / quote_shipping / chat
   ✅ Catálogo: prioriza Supabase VIEW public.catalog_products (RLS+grants safe)
   ✅ Detecta imágenes existentes y omite las que no (sin romper carousel)
   ✅ NO cambia nombres de productos (respeta espacios en name)
   ✅ Soporta rutas con espacios (las encodea al cargar imágenes)
   ✅ Envío: manda items [{id, sku, qty}] (ÚNICO OS ready)
   ✅ PWA: /?openCart=1 abre carrito automáticamente
   ✅ NEW: Lee hero/promo/mantenimiento desde Supabase site_public_content
   ✅ NEW: Compat functions para tu HTML (openDrawerCompat, checkoutCompat, etc)
   ========================================================= */

/* -----------------------
   1) CONFIG REAL (respeta claves)
------------------------ */
const CONFIG = {
  stripeKey:
    "pk_live_51STepg1ExTx11WqTGdkk68CLhZHqnBkIAzE2EacmhSR336HvR9nQY5dskyPWotJ6AExFjstC7C7wUTsOIIzRGols00hFSwI8yp",

  supabaseUrl: "https://lpbzndnavkbpxwnlbqgb.supabase.co",
  supabaseKey:
    "REEMPLAZA_AQUI_TU_SUPABASE_ANON_KEY_COMPLETA",

  supabaseCatalogView: "catalog_products",

  // ✅ NUEVO: site_settings safe views (ya las creaste)
  supabaseSitePublicContentView: "site_public_content",
  supabaseSitePublicSettingsView: "site_public_settings",

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

  catalogUrl: "/data/catalog.json",
  fallbackImg: "/assets/hero.webp",
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
    return data;
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
const STATE = {
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
  maintenanceMode: false,
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
  if (STATE.__imgOkCache.has(u)) return Promise.resolve(!!STATE.__imgOkCache.get(u));

  return new Promise((resolve) => {
    const img = new Image();
    let done = false;

    const finish = (ok) => {
      if (done) return;
      done = true;
      STATE.__imgOkCache.set(u, !!ok);
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
   Public Site Settings (site_settings -> site_public_* views)
------------------------ */
function ensurePromoBar() {
  let el = document.getElementById("promoBar");
  if (!el) {
    el = document.createElement("div");
    el.id = "promoBar";
    el.className = "promoBar";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.prepend(el);
  }
  return el;
}

function applyPublicContent(row) {
  try {
    const h1 = document.querySelector(".hero__copy h1");
    if (h1 && row?.hero_title) h1.textContent = String(row.hero_title);

    const img = document.querySelector(".hero__media img");
    if (img && row?.hero_image) img.setAttribute("src", String(row.hero_image));

    const promoActive = !!row?.promo_active;
    const promoText = row?.promo_text ? String(row.promo_text) : "";
    const bar = ensurePromoBar();
    if (promoActive && promoText) {
      bar.textContent = promoText;
      bar.style.display = "block";
      document.documentElement.classList.add("promo-on");
    } else {
      bar.textContent = "";
      bar.style.display = "none";
      document.documentElement.classList.remove("promo-on");
    }

    const maint = !!row?.maintenance_mode;
    STATE.maintenanceMode = maint;
    document.documentElement.classList.toggle("maintenance-on", maint);
  } catch (_) {}
}

function applyPublicSettings(row) {
  try {
    const socials = row?.socials && typeof row.socials === "object" ? row.socials : null;
    if (!socials) return;

    const map = {
      facebook: "Facebook",
      instagram: "Instagram",
      tiktok: "TikTok",
      youtube: "YouTube",
      whatsapp: "WhatsApp",
    };

    Object.entries(map).forEach(([k, label]) => {
      const url = socials[k];
      if (!url) return;
      const a = document.querySelector(`a[aria-label="${label}"]`);
      if (a) a.setAttribute("href", String(url));
    });
  } catch (_) {}
}

async function loadPublicSiteConfig() {
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey) return;

  const base = CONFIG.supabaseUrl.replace(/\/+$/, "");
  const headers = {
    apikey: CONFIG.supabaseKey,
    Authorization: `Bearer ${CONFIG.supabaseKey}`,
    "Content-Type": "application/json",
  };

  try {
    const view = CONFIG.supabaseSitePublicContentView || "site_public_content";
    const url = `${base}/rest/v1/${encodeURIComponent(view)}?select=*`;
    const rows = await fetchJSON(url, { headers });
    if (Array.isArray(rows) && rows[0]) applyPublicContent(rows[0]);
  } catch (e) {}

  try {
    const view = CONFIG.supabaseSitePublicSettingsView || "site_public_settings";
    const url = `${base}/rest/v1/${encodeURIComponent(view)}?select=*`;
    const rows = await fetchJSON(url, { headers });
    if (Array.isArray(rows) && rows[0]) applyPublicSettings(rows[0]);
  } catch (e) {}
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
        STATE.products = normalizeProducts(data);
        renderGrid(getFilteredProducts());
        return;
      }
    }
  } catch (e) {}

  try {
    const data = await fetchJSON(CONFIG.catalogUrl, { cache: "no-store" }, 12000);
    const list = Array.isArray(data?.products) ? data.products : Array.isArray(data) ? data : [];
    if (Array.isArray(data?.sections)) STATE.sections = data.sections;
    if (list.length) {
      STATE.products = normalizeProducts(list);
      ensureSectionChipsFromCatalog();
      renderGrid(getFilteredProducts());
      return;
    }
  } catch (e) {}

  STATE.products = normalizeProducts(getLocalCatalog());
  renderGrid(getFilteredProducts());
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
   9) FILTERS + UI
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

  if (["BAJA_1000", "BAJA_500", "BAJA_400", "SF_250"].includes(f)) {
    return String(p.sectionId || "").toUpperCase() === f;
  }

  const sub = normalizeStr(p.subSection);
  if (f === "HOODIES") return sub.includes("hoodie") || sub.includes("sudadera");
  if (f === "TEES") return sub.includes("camiseta") || sub.includes("playera") || sub.includes("tee") || sub.includes("tank");
  if (f === "CAPS") return sub.includes("gorra") || sub.includes("cap");

  return true;
}

function getFilteredProducts() {
  return (STATE.products || []).filter((p) => matchesFilter(p, STATE.filter));
}

function ensureSectionChipsFromCatalog() {
  const filtersWrap = document.querySelector(".filters");
  if (!filtersWrap) return;
  if (!Array.isArray(STATE.sections) || !STATE.sections.length) return;

  const existing = new Set([...filtersWrap.querySelectorAll(".chip")].map((c) => String(c.dataset.filter || "").toUpperCase()));

  STATE.sections.forEach((s) => {
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
      STATE.filter = id;
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

    return `
      <div class="cardMedia" style="position:relative; width:100%; overflow:hidden;">
        <div class="carousel" data-pid="${pid}" style="scroll-snap-type:x mandatory; overflow:auto; display:flex;">
          ${slides}
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

/* -----------------------
   11) CART
------------------------ */
function cartCountTotal() {
  return (STATE.cart || []).reduce((a, b) => a + clampQty(b.qty), 0);
}

function cartSubtotal() {
  return (STATE.cart || []).reduce((a, b) => a + Number(b.price || 0) * clampQty(b.qty), 0);
}

function saveCart() {
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(STATE.cart || []));

  const qty = cartCountTotal();
  const cc = $("#cartCount");
  if (cc) cc.textContent = String(qty);
  $$(".cartCount").forEach((el) => (el.textContent = String(qty)));

  updateDrawerUI();
}

function addToCart(id) {
  if (STATE.maintenanceMode) return toast("Tienda en mantenimiento.", "info");

  const p = (STATE.products || []).find((x) => String(x.id) === String(id));
  if (!p) return toast("Producto no disponible", "error");

  const pid = safeId(p.id);
  const size = $(`#size-${pid}`)?.value || "Unitalla";
  const key = `${p.id}-${size}`;

  const ex = STATE.cart.find((i) => i.key === key);

  const thumbCandidate =
    (Array.isArray(p.images) && p.images[0]) ? p.images[0] : p.img;

  const thumb = urlEncodePathIfNeeded(safeUrl(thumbCandidate) || CONFIG.fallbackImg);

  if (ex) ex.qty = clampQty(ex.qty + 1);
  else {
    STATE.cart.push({
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

  playSound("success");
  saveCart();
  openDrawer();
  toast("Agregado al carrito", "success");
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

/* -----------------------
   14) CHECKOUT
------------------------ */
async function doCheckout() {
  if (STATE.maintenanceMode) return toast("Tienda en mantenimiento. Intenta más tarde.", "info");
  if (!STATE.cart.length) return toast("Carrito vacío", "error");

  const payload = {
    cart: STATE.cart,
    shipping: STATE.shipping,
    shippingMode: STATE.shipping.mode,
    shippingData: {},
    cancel_url: window.location.href,
    success_url: window.location.origin + "/?status=success",
    promoCode: "",
  };

  try {
    const data =
      (await postJSON(CONFIG.endpoints.checkout, payload, 20000)) ||
      (await postJSON(CONFIG.endpoints.apiCheckout, payload, 20000));

    if (data?.url) window.location.href = String(data.url);
    else toast("No se pudo iniciar pago.", "error");
  } catch {
    toast("Error en pago. Intenta de nuevo.", "error");
  }
}

/* -----------------------
   16) LEGAL + COOKIES
------------------------ */
function openLegal(type) {
  const modal = $("#legalModal");
  if (!modal) return;
  modal.classList.add("active", "show");
}
function closeLegal() {
  $("#legalModal")?.classList.remove("active", "show");
}
function acceptCookies() {
  const b = $("#cookieBanner") || $(".cookieBanner");
  if (b) b.style.display = "none";
  localStorage.setItem("score_cookies", "accepted");
}

/* -----------------------
   Compat aliases (HTML onclick hooks)
------------------------ */
function openDrawerCompat() { openDrawer(); }
function closeDrawerCompat() { closeDrawer(); }
function quoteShippingUICompat() { /* tu HTML lo llama; si no tienes modal, no hace nada */ }
function checkoutCompat() { doCheckout(); }
function openLegalCompat() { openLegal(); }
function closeLegalCompat() { closeLegal(); }
function acceptCookiesCompat() { acceptCookies(); }

/* -----------------------
   20) DOM READY
------------------------ */
document.addEventListener("DOMContentLoaded", async () => {
  initStripe();
  await loadPublicSiteConfig();
  await loadCatalog();
  saveCart();

  const params = new URLSearchParams(window.location.search);
  if (params.get("status") === "success") {
    toast("¡Pago confirmado! 🏁", "success");
    STATE.cart = [];
    saveCart();
    removeQueryParams(["status"]);
  } else if (params.get("status") === "cancel") {
    toast("Pago cancelado", "info");
    removeQueryParams(["status"]);
  }
});

/* EXPORTS */
window.addToCart = addToCart;
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.doCheckout = doCheckout;

// compat
window.openDrawerCompat = openDrawerCompat;
window.closeDrawerCompat = closeDrawerCompat;
window.checkoutCompat = checkoutCompat;
window.openLegalCompat = openLegalCompat;
window.closeLegalCompat = closeLegalCompat;
window.acceptCookiesCompat = acceptCookiesCompat;