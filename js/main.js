/* =========================================================
   SCORE STORE — UNIFIED PRODUCTION ENGINE v2026 (360)
   ✅ Catálogo: Supabase (REST) -> fallback /data/catalog.json -> fallback local
   ✅ Checkout: Netlify Function (Stripe Live) -> fallback /api/checkout
   ✅ Shipping Quote: Netlify Function -> fallback /api/quote -> fallback fijo
   ✅ UI: compatible con tus 2 HTML (drawer active/open, backdrop/overlay, chips, etc.)
   ✅ AI: Netlify Function -> fallback /api/chat -> offline
   ✅ Extras: social proof, cookies, service worker, intro/splash
   ========================================================= */

/* -----------------------
   1) CONFIG REAL (respeta claves)
------------------------ */
const CONFIG = {
  // PUBLIC FRONTEND KEYS (provided by you)
  stripeKey:
    "pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh",

  supabaseUrl: "https://lpbzndnavkbpxwnlbqgb.supabase.co",
  supabaseKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE",

  // Endpoints (prefer Netlify Functions)
  endpoints: {
    checkout: "/.netlify/functions/stripe-checkout",
    quote: "/.netlify/functions/envia-quote",
    ai: "/.netlify/functions/gemini-chat",

    // fallback APIs (si existen en tu backend)
    apiCheckout: "/api/checkout",
    apiQuote: "/api/quote",
    apiChat: "/api/chat",
  },

  storageKey: "score_cart_2026",
};

/* -----------------------
   2) Helpers (no duplicados)
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

// URL segura (no “inventa”)
function safeUrl(u) {
  const raw = String(u || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/")) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  return "";
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

/* -----------------------
   3) Stripe Init (Live)
------------------------ */
let stripe = null;
function initStripe() {
  if (stripe) return stripe;
  if (window.Stripe && CONFIG.stripeKey) {
    stripe = window.Stripe(CONFIG.stripeKey);
  }
  return stripe;
}

/* -----------------------
   4) STATE
------------------------ */
const state = {
  cart: JSON.parse(localStorage.getItem(CONFIG.storageKey) || "[]"),
  products: [],
  filter: "ALL",
  shipping: { mode: "pickup", quote: 0, label: "Pickup Tijuana (Gratis)" },
  __quoteTimer: null,
  __quoteInFlight: false,
  __socialTimer: null,
  __introDone: false,
};

/* -----------------------
   5) AUDIO FX (WebAudio, sin assets)
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
    // pop default
    osc.type = "sine";
    osc.frequency.setValueAtTime(720, now);
    g.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    osc.start(now);
    osc.stop(now + 0.15);
  }
}

/* -----------------------
   6) TOAST (CSS existente)
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
   7) CATALOGO (Supabase -> /data/catalog.json -> local)
------------------------ */
async function loadCatalog() {
  const grid = $("#productsGrid");
  if (grid) {
    grid.innerHTML =
      "<div style='grid-column:1/-1;text-align:center;opacity:.6'>Cargando inventario...</div>";
  }

  // 1) Supabase REST first (real)
  try {
    const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/products?select=*`, {
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
    console.warn("[catalog] supabase fail:", e);
  }

  // 2) fallback /data/catalog.json
  try {
    const { res, data } = await fetchJSON("/data/catalog.json", { cache: "no-store" }, 12000);
    if (res.ok) {
      const list = Array.isArray(data?.products) ? data.products : Array.isArray(data) ? data : [];
      if (list.length) {
        state.products = normalizeProducts(list);
        renderGrid(getFilteredProducts());
        return;
      }
    }
  } catch (e) {
    console.warn("[catalog] /data/catalog.json fail:", e);
  }

  // 3) final fallback local (no vacío)
  state.products = normalizeProducts(getLocalCatalog());
  renderGrid(getFilteredProducts());
}

function normalizeProducts(list) {
  return (list || []).map((p, idx) => {
    const id = p?.id ?? p?.sku ?? `p${idx + 1}`;
    const images =
      Array.isArray(p?.images) && p.images.length
        ? p.images
        : p?.img
        ? [p.img]
        : [];
    return {
      id: String(id),
      sectionId: String(p?.sectionId || p?.category || "ALL").toUpperCase(),
      name: String(p?.name || p?.title || "Producto"),
      baseMXN: Number(p?.baseMXN ?? p?.price ?? 0),
      img: safeUrl(p?.img) || safeUrl(images[0]) || "/assets/placeholder.webp",
      images: images.map(safeUrl).filter(Boolean),
      sizes: Array.isArray(p?.sizes) && p.sizes.length ? p.sizes : ["Unitalla"],
    };
  });
}

// Fallback local alineado a tus assets
function getLocalCatalog() {
  return [
    {
      id: "p1",
      sectionId: "HOODIES",
      name: "Baja 1000 Legacy Hoodie",
      baseMXN: 1200,
      img: "/assets/prod1.webp",
      images: ["/assets/prod1.webp"],
      sizes: ["S", "M", "L", "XL"],
    },
    {
      id: "p2",
      sectionId: "TEES",
      name: "Score International Tee",
      baseMXN: 650,
      img: "/assets/prod2.webp",
      images: ["/assets/prod2.webp"],
      sizes: ["S", "M", "L", "XL"],
    },
    {
      id: "p3",
      sectionId: "CAPS",
      name: "Trophy Truck Cap",
      baseMXN: 800,
      img: "/assets/prod3.webp",
      images: ["/assets/prod3.webp"],
      sizes: ["Unitalla"],
    },
    {
      id: "p4",
      sectionId: "ACCESORIOS",
      name: "Sticker Pack Oficial",
      baseMXN: 250,
      img: "/assets/prod4.webp",
      images: ["/assets/prod4.webp"],
      sizes: ["Pack"],
    },
  ];
}

function getFilteredProducts() {
  if (!state.filter || state.filter === "ALL") return state.products;
  const f = String(state.filter).toUpperCase();
  return (state.products || []).filter((p) => String(p.sectionId).toUpperCase() === f);
}

/* -----------------------
   8) RENDER GRID (soporta: champItem + card + carousel)
------------------------ */
function renderGrid(list) {
  const grid = $("#productsGrid");
  if (!grid) return;

  grid.innerHTML = "";

  if (!list || !list.length) {
    grid.innerHTML =
      "<div style='grid-column:1/-1;text-align:center;opacity:.6'>No hay productos en esta categoría.</div>";
    return;
  }

  list.forEach((p) => {
    const pid = safeId(p.id);
    const card = document.createElement("div");

    // Preferimos la clase que ya tienes para “card única no plano”
    // Si tu CSS es champItem, queda perfecto; si es card, también.
    card.className = "champItem card";

    const nameSafe = escapeHtml(p.name);
    const price = fmtMXN(p.baseMXN);

    const images = (p.images && p.images.length ? p.images : [p.img])
      .map(safeUrl)
      .filter(Boolean);

    const media = buildMediaHTML(images, nameSafe, pid);
    const sizes = (p.sizes && p.sizes.length ? p.sizes : ["Unitalla"]).map(String);

    // Selector talla compatible con ambos estilos
    const sizeSelectHTML = `
      <select id="size-${pid}" class="size-selector">
        ${sizes.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}
      </select>
    `;

    // Botón compatible:
    // - HTML A: onclick addToCart('id')
    // - HTML B: listener interno
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

    grid.appendChild(card);

    card.querySelector(`[data-add="${pid}"]`)?.addEventListener("click", () => addToCart(p.id));

    // carousel dots update (si existe)
    const car = card.querySelector(".carousel");
    if (car) {
      car.addEventListener("scroll", () => updateDots(car, pid), { passive: true });
      requestAnimationFrame(() => updateDots(car, pid));
    }
  });
}

function buildMediaHTML(images, nameSafe, pid) {
  if (images.length > 1) {
    const slides = images
      .map(
        (src) =>
          `<div class="carousel-item"><img src="${src}" class="prodImg" loading="lazy" alt="${nameSafe}" width="420" height="525"></div>`
      )
      .join("");

    const dots = images
      .map((_, i) => `<div class="dot ${i === 0 ? "active" : ""}"></div>`)
      .join("");

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

  const src = images[0] || "/assets/placeholder.webp";
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
   9) CART (single source of truth)
------------------------ */
function cartCountTotal() {
  return (state.cart || []).reduce((a, b) => a + clampQty(b.qty), 0);
}

function cartSubtotal() {
  return (state.cart || []).reduce((a, b) => a + Number(b.price || 0) * clampQty(b.qty), 0);
}

function saveCart() {
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(state.cart || []));

  // update badges (soporta #cartCount y .cartCount)
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
  const thumb = (p.images && p.images[0]) ? p.images[0] : p.img;

  if (ex) ex.qty = clampQty(ex.qty + 1);
  else {
    state.cart.push({
      key,
      id: p.id,
      name: p.name,
      price: Number(p.baseMXN || 0),
      img: safeUrl(thumb) || "/assets/placeholder.webp",
      size: String(size),
      qty: 1,
    });
  }

  // invalida envío si no pickup
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

    // compatible con ambos estilos
    row.className = "cart-card cartRow";

    row.innerHTML = `
      <img src="${safeUrl(item.img) || "/assets/placeholder.webp"}" alt="" style="width:60px; height:70px; object-fit:contain; background:#fff; border-radius:6px;">
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

  // Totales: soporta ambos HTML
  if ($("#cartSubtotal")) $("#cartSubtotal").textContent = fmtMXN(sub);
  if ($("#cartShipping")) {
    $("#cartShipping").textContent =
      state.shipping.mode === "pickup" ? "Gratis" : ship > 0 ? fmtMXN(ship) : "Pendiente";
  }

  const shipLabel = $("#cartShipLabel") || $("#miniShipLabel");
  if (shipLabel) {
    if (state.shipping.mode === "pickup") {
      shipLabel.textContent = "Pickup Gratis";
    } else {
      shipLabel.textContent = state.shipping.label || (ship > 0 ? fmtMXN(ship) : "Cotiza envío");
    }
  }

  const totalEl = $("#cartTotal");
  if (totalEl) totalEl.textContent = fmtMXN(total);
}

/* -----------------------
   10) DRAWER OPEN/CLOSE (compat)
------------------------ */
function openDrawer() {
  const drawer = $("#cartDrawer");
  drawer?.classList.add("active", "open");

  // overlay variants
  $("#pageOverlay")?.classList.add("active", "show");
  $(".page-overlay")?.classList.add("active", "show");
  $("#backdrop")?.classList.add("active", "show");

  document.body.classList.add("noScroll", "modalOpen");
  document.body.style.overflow = "hidden";

  saveCart();
}

function closeDrawer() {
  const drawer = $("#cartDrawer");
  drawer?.classList.remove("active", "open");

  $("#pageOverlay")?.classList.remove("active", "show");
  $(".page-overlay")?.classList.remove("active", "show");
  $("#backdrop")?.classList.remove("active", "show");

  document.body.classList.remove("noScroll", "modalOpen");
  document.body.style.overflow = "";
}

// Aliases (por si tu HTML usa openCart/closeCart)
function openCart() {
  openDrawer();
}
function closeCart() {
  closeDrawer();
}

/* -----------------------
   11) SHIPPING (mini drawer + landing)
------------------------ */
function getShipModeFromUI() {
  // A) Radio group (shipMode) o B) select#shippingMode
  const sel = $("#shippingMode");
  if (sel) return String(sel.value || "pickup");

  const checked = document.querySelector('input[name="shipMode"]:checked');
  return String(checked?.value || "pickup");
}

function setShipModeToUI(mode) {
  const sel = $("#shippingMode");
  if (sel) sel.value = mode;

  const radios = document.querySelectorAll('input[name="shipMode"]');
  radios.forEach((r) => {
    r.checked = String(r.value) === String(mode);
  });

  const zip = $("#miniZip");
  if (zip) zip.style.display = mode === "pickup" ? "none" : "block";
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
  // backend puede cotizar por qty
  const items = (state.cart || []).map((i) => ({ qty: clampQty(i.qty) }));
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
    const payload = {
      zip,
      country: modeToCountry(mode),
      items: cartItemsForQuote(),
    };

    // Prefer Netlify function
    let res, data;

    ({ res, data } = await postJSON(CONFIG.endpoints.quote, payload, 16000));
    if (!res.ok) {
      // fallback API
      ({ res, data } = await postJSON(CONFIG.endpoints.apiQuote, payload, 16000));
    }

    // Accepted shapes:
    // - { price, carrier }  (netlify)
    // - { ok:true, cost, label } (api)
    let cost = 0;
    let label = "";

    if (data?.price) {
      cost = Number(data.price || 0);
      label = String(data.carrier || "Envío actualizado");
    } else if (data?.ok) {
      cost = Number(data.cost || 0);
      label = String(data.label || "Envío actualizado");
    } else {
      throw new Error(data?.error || "QUOTE_FAILED");
    }

    if (!cost) throw new Error("QUOTE_ZERO");

    state.shipping = {
      mode,
      quote: cost,
      label,
    };

    saveCart();
    toast("Envío actualizado", "success");
    playSound("success");
  } catch (e) {
    console.warn("[quote] fallback:", e);

    // Fallback fijo realista (solo si backend no responde)
    const fallbackCost = mode === "us" ? 450 : 180;
    state.shipping.quote = fallbackCost;
    state.shipping.label = "Envío Fijo (Fallback)";

    saveCart();
    toast("No se pudo cotizar en vivo. Usando fallback.", "info");
  } finally {
    state.__quoteInFlight = false;
  }
}

async function quoteShippingUI() {
  // Landing section #envios
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
    if (!res.ok) {
      ({ res, data } = await postJSON(CONFIG.endpoints.apiQuote, payload, 16000));
    }

    let cost = 0;
    let label = "";

    if (data?.price) {
      cost = Number(data.price || 0);
      label = String(data.carrier || "Tarifa");
    } else if (data?.ok) {
      cost = Number(data.cost || 0);
      label = String(data.label || "Tarifa");
    } else {
      throw new Error(data?.error || "QUOTE_FAILED");
    }

    if (out) out.innerHTML = `<b>${escapeHtml(label)}</b> · ${fmtMXN(cost)}`;
    playSound("success");
  } catch (e) {
    console.warn("[quote-ui] fail:", e);
    if (out) out.textContent = "No se encontró tarifa. Intenta otro CP.";
  }
}

/* -----------------------
   12) CHECKOUT (Netlify -> API -> Stripe redirect)
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

    // 1) Netlify checkout preferred
    let res, data;
    ({ res, data } = await postJSON(CONFIG.endpoints.checkout, payload, 20000));

    // 2) Fallback API
    if (!res.ok) {
      ({ res, data } = await postJSON(CONFIG.endpoints.apiCheckout, payload, 20000));
    }

    if (!res.ok) throw new Error(data?.error || "CHECKOUT_HTTP_" + res.status);

    // Accepted shapes:
    // - { id: "cs_test|cs_live..." } for Stripe session
    // - { sessionId: "..." }
    // - { url: "https://checkout.stripe.com/..." } direct url
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
   13) AI (Netlify -> API -> offline)
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
    if (!res.ok) {
      ({ res, data } = await postJSON(CONFIG.endpoints.apiChat, { message: text }, 20000));
    }
    if (!res.ok) throw new Error("AI_HTTP_" + res.status);

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
   14) LEGAL (openLegal + .jsLegalLink)
------------------------ */
function openLegal(type) {
  // compat: legacy modal (#legalModal .active) + new modal (#legalModal .show)
  const modal = $("#legalModal");
  if (!modal) return;

  const title = $("#legalTitle");
  const body = $("#legalBody");

  const lib = window.LEGAL_CONTENT || {};
  const FALLBACK = {
    privacy: {
      title: "AVISO DE PRIVACIDAD",
      html: "<p>Tu información se usa únicamente para procesar tu pedido y brindarte soporte.</p>",
    },
    terms: {
      title: "TÉRMINOS Y CONDICIONES",
      html: "<p>Al comprar aceptas políticas de venta, tiempos de producción, envíos y devoluciones.</p>",
    },
    contact: {
      title: "CONTACTO",
      html:
        "<p><b>Email:</b> ventas.unicotextil@gmail.com<br><b>WhatsApp:</b> +52 664 123 4567</p>",
    },
  };

  const key = String(type || "privacy").trim();
  const item = lib[key] || FALLBACK[key] || FALLBACK.privacy;

  if (title) title.textContent = item.title || "Info";
  if (body) body.innerHTML = item.html || "<p>Contenido no disponible.</p>";

  modal.classList.add("active");
  modal.classList.add("show");
  document.body.classList.add("modalOpen", "noScroll");
}

function closeLegal() {
  const modal = $("#legalModal");
  modal?.classList.remove("active");
  modal?.classList.remove("show");
  document.body.classList.remove("modalOpen", "noScroll");
}

/* -----------------------
   15) COOKIES
------------------------ */
function acceptCookies() {
  const b = $("#cookieBanner") || $(".cookieBanner");
  if (b) b.style.display = "none";
  localStorage.setItem("score_cookies", "accepted");
  localStorage.setItem("score_cookie_consent", "all");
}

/* -----------------------
   16) INTRO + SPLASH (soporta ambos)
------------------------ */
function initIntroSplash() {
  // Intro (FINAL_AUDIT)
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

  // Splash RPM
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

/* -----------------------
   17) Social Proof (no invasivo)
------------------------ */
function initSocialProof() {
  const names = ["Alberto", "Mariana", "Roberto", "Carlos", "Juan", "Fernanda", "Sofía", "Diego"];
  const locs = ["Tijuana", "Ensenada", "San Diego", "Mexicali", "Rosarito", "Tecate"];
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const show = () => {
    const cartOpen =
      $("#cartDrawer")?.classList.contains("open") || $("#cartDrawer")?.classList.contains("active");
    const aiOpen =
      $("#aiChatModal")?.classList.contains("show") || $("#aiChatModal")?.classList.contains("active");
    if (cartOpen || aiOpen) return;

    toast(`🏁 ${pick(names)} de ${pick(locs)} armó su pedido oficial.`, "info");
  };

  clearInterval(state.__socialTimer);
  setTimeout(show, 18000);
  state.__socialTimer = setInterval(show, 42000);
}

/* -----------------------
   18) Service Worker (si existe /sw.js)
------------------------ */
function initServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost") return;

  navigator.serviceWorker
    .register("/sw.js?v=2026_PROD_UNIFIED_360")
    .catch(() => {});
}

/* -----------------------
   19) BOOT
------------------------ */
function bindUI() {
  // Drawer triggers
  $(".cartBtn")?.addEventListener("click", openDrawer);
  $("#cartBtn")?.addEventListener("click", openDrawer);

  $(".page-overlay")?.addEventListener("click", closeDrawer);
  $("#pageOverlay")?.addEventListener("click", closeDrawer);
  $("#backdrop")?.addEventListener("click", closeDrawer);

  // Drawer close buttons
  $(".closeBtn")?.addEventListener("click", closeDrawer);
  $(".drawerClose")?.addEventListener("click", closeDrawer);

  // AI button
  $(".ai-btn-float")?.addEventListener("click", toggleAiAssistant);

  // AI send (si existe botón)
  $(".ai-send")?.addEventListener("click", sendAiMessage);
  bindAiEnter();

  // Legal buttons (.jsLegalLink)
  $$(".jsLegalLink").forEach((btn) => {
    btn.addEventListener("click", () => openLegal(btn.dataset.legal || "privacy"));
  });

  // Legal close/backdrop
  $("#legalClose")?.addEventListener("click", closeLegal);
  $("#legalBackdrop")?.addEventListener("click", closeLegal);

  // Filters
  $$(".chip").forEach((c) => {
    c.addEventListener("click", () => {
      $$(".chip").forEach((ch) => ch.classList.remove("active"));
      c.classList.add("active");
      state.filter = c.dataset.filter || "ALL";
      renderGrid(getFilteredProducts());
      playSound("click");
    });
  });

  // Shipping UI (mini)
  $("#shippingMode")?.addEventListener("change", (e) => toggleShipping(e.target.value));
  $("#miniZip")?.addEventListener("input", requestMiniQuote);

  // Shipping UI (radio)
  document.querySelectorAll('input[name="shipMode"]').forEach((r) => {
    r.addEventListener("change", () => toggleShipping(r.value));
  });

  // Escape close all
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeLegal();
    const ai = $("#aiChatModal") || $(".ai-chat-modal");
    ai?.classList.remove("active", "show");
    closeDrawer();
  });

  // Cookie banner auto-hide if accepted
  if (localStorage.getItem("score_cookies") === "accepted") {
    const b = $("#cookieBanner") || $(".cookieBanner");
    if (b) b.style.display = "none";
  }

  // Success param
  const params = new URLSearchParams(window.location.search);
  if (params.get("status") === "success") {
    toast("¡Pago confirmado! 🏁", "success");
    state.cart = [];
    saveCart();
    history.replaceState({}, document.title, "/");
  } else if (params.get("status") === "cancel") {
    toast("Pago cancelado", "info");
    history.replaceState({}, document.title, "/");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initStripe();
  initIntroSplash();
  loadCatalog();
  // aplica modo shipping desde UI actual
  toggleShipping(getShipModeFromUI());
  bindUI();
  saveCart();

  initSocialProof();
initServiceWorker();
});

/* -----------------------
   20) EXPORTS (para onclick legacy en HTML)
------------------------ */
window.addToCart = addToCart;
window.modQty = modQty;

window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;

// aliases por si tu HTML usa openCart/closeCart
window.openCart = openCart;
window.closeCart = closeCart;

window.toggleShipping = toggleShipping;
window.quoteShipping = quoteShippingMini; // compat con tu HTML 1 (debounce ya está)
window.quoteShippingMini = quoteShippingMini;
window.quoteShippingUI = quoteShippingUI;

window.doCheckout = doCheckout;
window.checkout = doCheckout; // compat con HTML 2

window.toggleAiAssistant = toggleAiAssistant;
window.sendAiMessage = sendAiMessage;

window.openLegal = openLegal;
window.closeLegal = closeLegal;

window.acceptCookies = acceptCookies;