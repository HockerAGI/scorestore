/* =========================================================
   SCORE STORE — MASTER JS PROD 2026 (PATCH v361)
   Fixes:
   - Splash / Intro stuck (safe localStorage parse + failsafe kill)
   - Shipping quote real (/.netlify/functions/quote_shipping)
   - Checkout includes shipping + zip/country
   - Basic AI chat UI wiring (/.netlify/functions/chat)
   - Cookie banner persist
   ========================================================= */

const BUILD_VERSION = "2026_PROD_UNIFIED_361";

const CONFIG = {
  // Public keys ONLY (ok en frontend)
  stripeKey: "pk_live_51STepg1ExTx11WqTGdkk68CLhZHqnBkIAzE2EacmhSR336HvR9nQY5dskyPWotJ6AExFjstC7C7wUTsOIIzRGols00hFSwI8yp",

  // Supabase (public anon). En este build NO se usa directo en el cliente (las views públicas se consultan desde functions).
  supabaseUrl: "https://lpbzndnavkbpxwnlbqgb.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwYnpuZG5hdmticHh3bmxicWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODAxMzMsImV4cCI6MjA4NDI1NjEzM30.YWmep-xZ6LbCBlhgs29DvrBafxzd-MN6WbhvKdxEeqE",

  endpoints: {
    checkout: "/.netlify/functions/create_checkout",
    quote: "/.netlify/functions/quote_shipping",
    ai: "/.netlify/functions/chat",
  },

  storageKey: "score_cart_2026",
  shipKey: "score_ship_2026",
  catalogUrl: "/data/catalog.json",
};

/* -----------------------
   Helpers
------------------------ */
const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));

const fmtMXN = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    Number(n || 0)
  );

function safeJsonParse(str, fallback) {
  try {
    const v = JSON.parse(str);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function safeStorageGet(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeStorageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

function clampInt(n, min, max) {
  const x = Math.round(Number(n || 0));
  return Math.max(min, Math.min(max, x));
}

function digitsOnly(s) {
  return String(s || "").replace(/[^\d]/g, "");
}

function normalizeZip(zip) {
  return digitsOnly(zip).slice(0, 5);
}

function isValidZip(zip) {
  return normalizeZip(zip).length === 5;
}

function sumQty(cart) {
  return (cart || []).reduce((acc, it) => acc + clampInt(it?.qty, 0, 99), 0);
}

function killSplash(hard = false) {
  const candidates = [
    document.getElementById("splash"),
    document.getElementById("splash-screen"),
    document.querySelector(".splash"),
  ].filter(Boolean);

  if (!candidates.length) return;

  candidates.forEach((el) => {
    // soft: fade
    if (!hard) {
      el.classList.add("hidden");
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
      // hard remove after a moment
      setTimeout(() => {
        try {
          el.style.display = "none";
          el.setAttribute("aria-hidden", "true");
        } catch {}
      }, 500);
      return;
    }

    // hard: immediate
    try {
      el.style.display = "none";
      el.classList.add("hidden");
      el.setAttribute("aria-hidden", "true");
    } catch {}
  });
}

function showToast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = String(msg || "");
  t.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

/* -----------------------
   State (robusto)
------------------------ */
let initialCart = [];
{
  const raw = safeStorageGet(CONFIG.storageKey, "[]");
  const parsed = safeJsonParse(raw, []);
  if (Array.isArray(parsed)) initialCart = parsed;
  else {
    // Si estaba corrupto, lo reseteamos para no romper toda la app
    safeStorageRemove(CONFIG.storageKey);
    initialCart = [];
  }
}

let initialShip = { mode: "pickup", zip: "", country: "MX", amount: 0, label: "Pickup Gratis" };
{
  const raw = safeStorageGet(CONFIG.shipKey, "");
  const parsed = raw ? safeJsonParse(raw, null) : null;
  if (parsed && typeof parsed === "object") {
    initialShip = {
      mode: parsed.mode || "pickup",
      zip: parsed.zip || "",
      country: (parsed.country || "MX").toUpperCase(),
      amount: Number(parsed.amount || 0),
      label: parsed.label || (parsed.mode === "pickup" ? "Pickup Gratis" : "Envío"),
    };
  }
}

const STATE = {
  cart: initialCart,
  products: [],
  filter: "ALL",

  ship: {
    mode: initialShip.mode, // pickup | mx | us
    zip: initialShip.zip,
    country: initialShip.country, // MX | US
    amount: Number(initialShip.amount || 0),
    label: initialShip.label,
  },

  maintenanceMode: false,
};

function persistShipping() {
  safeStorageSet(CONFIG.shipKey, JSON.stringify(STATE.ship));
}

/* -----------------------
   Cart UI
------------------------ */
function openDrawer() {
  const drawer = $("#cartDrawer");
  const overlay = $("#pageOverlay");
  if (drawer) drawer.classList.add("open");
  if (overlay) overlay.classList.add("show");
  document.body.classList.add("no-scroll");
}

function closeDrawer() {
  const drawer = $("#cartDrawer");
  const overlay = $("#pageOverlay");
  if (drawer) drawer.classList.remove("open");
  if (overlay) overlay.classList.remove("show");
  document.body.classList.remove("no-scroll");
}

window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;

function calcSubtotal() {
  return (STATE.cart || []).reduce(
    (acc, it) => acc + Number(it.price || 0) * clampInt(it.qty, 0, 99),
    0
  );
}

function updateTotalsUI() {
  const subtotal = calcSubtotal();
  const shipping = STATE.ship.mode === "pickup" ? 0 : Number(STATE.ship.amount || 0);
  const total = subtotal + shipping;

  const subEl = $("#cartSubtotal");
  const totalEl = $("#cartTotal");
  if (subEl) subEl.textContent = fmtMXN(subtotal);
  if (totalEl) totalEl.textContent = fmtMXN(total);

  const shipLabelEl = $("#cartShipLabel");
  const shipAmtEl = $("#cartShipping");

  if (shipLabelEl) {
    if (STATE.ship.mode === "pickup") shipLabelEl.textContent = "Pickup Gratis";
    else shipLabelEl.textContent = STATE.ship.label || "Envío";
  }
  if (shipAmtEl) shipAmtEl.textContent = fmtMXN(shipping);
}

function updateDrawerUI() {
  const container = $("#cartItems");
  if (!container) return;

  container.innerHTML = STATE.cart.length
    ? ""
    : "<p style='text-align:center;padding:20px;opacity:0.6;'>Tu carrito está vacío</p>";

  STATE.cart.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "cartRow";
    row.innerHTML = `
      <div class="cartThumb"><img src="${item.img}" alt=""></div>
      <div class="cartInfo">
        <div class="name">${item.name}</div>
        <div class="price">${fmtMXN(item.price)} x ${item.qty}</div>
        <div style="font-size:10px;opacity:0.6;">Talla: ${item.size}</div>
      </div>
      <button onclick="removeFromCart(${idx})" style="color:var(--score-red);font-weight:bold;padding:5px;">✕</button>
    `;
    container.appendChild(row);
  });

  updateTotalsUI();
}

function saveCart() {
  safeStorageSet(CONFIG.storageKey, JSON.stringify(STATE.cart || []));
  const qty = sumQty(STATE.cart);
  $$(".cartCount").forEach((el) => (el.textContent = String(qty)));
  updateDrawerUI();
}

window.removeFromCart = (idx) => {
  STATE.cart.splice(idx, 1);
  saveCart();
};

function addToCart(id) {
  if (STATE.maintenanceMode) return alert("Tienda en mantenimiento.");
  const p = STATE.products.find((x) => x.id === id);
  if (!p) return;

  const safeId = p.id.replace(/[^a-z0-9]/gi, "");
  const size = $(`#size-${safeId}`)?.value || "Unitalla";
  const key = `${id}-${size}`;
  const ex = STATE.cart.find((i) => i.key === key);

  if (ex) ex.qty = clampInt(ex.qty + 1, 1, 99);
  else {
    STATE.cart.push({
      key,
      id: p.id,
      name: p.name,
      price: Number(p.baseMXN || 0),
      img: p.img,
      size,
      qty: 1,
    });
  }

  saveCart();
  openDrawer();
}

window.addToCart = addToCart;

/* -----------------------
   Catalog UI
------------------------ */
async function renderGrid() {
  const grid = $("#productsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const filtered = (STATE.products || []).filter((p) => {
    if (STATE.filter === "ALL") return true;
    if (p.sectionId === STATE.filter) return true;
    if (STATE.filter === "HOODIES" && p.subSection === "Hoodies") return true;
    if (STATE.filter === "TEES" && p.subSection === "Camisetas") return true;
    if (STATE.filter === "CAPS" && p.subSection === "Gorras") return true;
    return false;
  });

  filtered.forEach((p) => {
    const safeId = p.id.replace(/[^a-z0-9]/gi, "");
    const card = document.createElement("div");
    card.className = "product-card";

    const sizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes : ["Unitalla"];

    card.innerHTML = `
      <div class="p-media"><img src="${p.img}" alt="${p.name}" loading="lazy"></div>
      <div class="p-body">
        <div class="p-top">
          <h3 class="p-name">${p.name}</h3>
          <span class="p-price">${fmtMXN(p.baseMXN)}</span>
        </div>
        <select id="size-${safeId}" class="p-size-sel">
          ${sizes.map((s) => `<option value="${s}">${s}</option>`).join("")}
        </select>
        <button class="p-btn-add" onclick="addToCart('${p.id}')">AGREGAR AL CARRITO</button>
      </div>
    `;

    grid.appendChild(card);
  });
}

async function loadCatalog() {
  const res = await fetch(CONFIG.catalogUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`catalog fetch failed (${res.status})`);
  const data = await res.json();
  const rawProducts = Array.isArray(data?.products) ? data.products : [];

  STATE.products = rawProducts.map((p) => ({
    ...p,
    sectionId: String(p.sectionId || "").toUpperCase(),
  }));
}

/* -----------------------
   Shipping (real)
------------------------ */
function applyShippingModeUI(mode) {
  // Sync radios (hero + drawer)
  $$('input[name="shipMode"], input[name="shipModeHero"]').forEach((r) => {
    if (r.value === mode) r.checked = true;
  });

  const zipRow = $("#zipRow");
  const heroZipWrap = $("#shipZipWrap");

  const showZip = mode !== "pickup";
  if (zipRow) zipRow.style.display = showZip ? "flex" : "none";
  if (heroZipWrap) heroZipWrap.style.display = showZip ? "block" : "none";

  if (mode === "pickup") {
    STATE.ship.amount = 0;
    STATE.ship.label = "Pickup Gratis";
    persistShipping();

    const shipQuote = $("#shipQuote");
    if (shipQuote) shipQuote.textContent = "Pickup gratis en Tijuana.";
    updateTotalsUI();
  } else {
    // reset label until quote
    STATE.ship.label = mode === "us" ? "Envío USA" : "Envío México";
    persistShipping();
    updateTotalsUI();
  }
}

function toggleShipping(mode) {
  const m = String(mode || "pickup").toLowerCase();
  if (!["pickup", "mx", "us"].includes(m)) return;

  STATE.ship.mode = m;
  STATE.ship.country = m === "us" ? "US" : "MX";
  persistShipping();
  applyShippingModeUI(m);
}

window.toggleShipping = toggleShipping;

function pickZipFromUI() {
  const a = normalizeZip($("#miniZip")?.value || "");
  const b = normalizeZip($("#shipZip")?.value || "");
  return a || b || "";
}

async function quoteShippingUI() {
  if (STATE.ship.mode === "pickup") {
    showToast("Pickup: $0");
    applyShippingModeUI("pickup");
    return;
  }

  const zip = pickZipFromUI();
  const country = STATE.ship.country || (STATE.ship.mode === "us" ? "US" : "MX");

  if (!isValidZip(zip)) {
    showToast("CP/ZIP inválido (5 dígitos)");
    return;
  }

  const items = (STATE.cart || []).map((it) => ({ id: it.id, qty: it.qty }));
  const payload = { zip, country, items };

  const shipQuoteEl = $("#shipQuote");
  if (shipQuoteEl) shipQuoteEl.textContent = "Cotizando...";

  try {
    const res = await fetch(CONFIG.endpoints.quote, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "quote failed");
    }

    const amount = Math.round(Number(data.amount || 0));
    const label = String(data.label || "Envío");

    STATE.ship.zip = zip;
    STATE.ship.country = country;
    STATE.ship.amount = amount;
    STATE.ship.label = label;

    persistShipping();

    if (shipQuoteEl) shipQuoteEl.textContent = `${label}: ${fmtMXN(amount)}`;
    updateTotalsUI();

    showToast(`Envío: ${fmtMXN(amount)}`);
  } catch (err) {
    console.error("[quoteShippingUI]", err);
    if (shipQuoteEl) shipQuoteEl.textContent = "No se pudo cotizar. Intenta otra vez.";
    showToast("No se pudo cotizar");
  }
}

window.quoteShippingUI = quoteShippingUI;

/* -----------------------
   Checkout
------------------------ */
window.doCheckout = async () => {
  const btn = $("#checkoutBtn");
  if (!btn) return;

  if (!Array.isArray(STATE.cart) || STATE.cart.length === 0) {
    showToast("Tu carrito está vacío");
    return;
  }

  // Si eligió envío y NO cotizó, intentamos cotizar antes de pagar
  if (STATE.ship.mode !== "pickup") {
    const zip = pickZipFromUI();
    if (isValidZip(zip) && (!STATE.ship.amount || STATE.ship.zip !== zip)) {
      await quoteShippingUI();
    }
  }

  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "PROCESANDO...";

  try {
    const shipping = STATE.ship.mode === "pickup" ? 0 : Number(STATE.ship.amount || 0);

    const res = await fetch(CONFIG.endpoints.checkout, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cart: STATE.cart,
        shipping,
        shippingLabel: STATE.ship.label,
        shippingMode: STATE.ship.mode,
        shippingData: {
          postal_code: STATE.ship.zip || pickZipFromUI() || "",
          country: STATE.ship.country || "MX",
        },
      }),
    });

    const data = await res.json();
    if (data?.url) window.location.href = data.url;
    else throw new Error(data?.error || "No se recibió URL de pago");
  } catch (e) {
    console.error(e);
    alert("Error al conectar con Stripe. Revisa la consola.");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
};

/* -----------------------
   Cookies
------------------------ */
function acceptCookies() {
  safeStorageSet("cookieConsent", "1");
  const b = $("#cookieBanner");
  if (b) b.style.display = "none";
}

window.acceptCookies = acceptCookies;

function initCookieBanner() {
  const b = $("#cookieBanner");
  if (!b) return;
  const ok = safeStorageGet("cookieConsent", "");
  if (ok === "1") b.style.display = "none";
}

/* -----------------------
   AI Chat (UI)
------------------------ */
function appendAiMsg(role, text) {
  const wrap = $("#aiMsgs");
  if (!wrap) return;

  const row = document.createElement("div");
  // CSS ya trae estilos para: .ai-msg + (.ai-me | .ai-bot)
  row.className = role === "user" ? "ai-msg ai-me" : "ai-msg ai-bot";
  row.textContent = String(text || "");
  wrap.appendChild(row);
  wrap.scrollTop = wrap.scrollHeight;
}

async function sendAiMessage(message) {
  const msg = String(message || "").trim();
  if (!msg) return;

  appendAiMsg("user", msg);

  try {
    const res = await fetch(CONFIG.endpoints.ai, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg }),
    });

    const data = await res.json();
    const reply = String(data?.reply || "").trim() || "Ok.";
    appendAiMsg("bot", reply);
  } catch (e) {
    console.error("[ai]", e);
    appendAiMsg(
      "bot",
      "Ahorita no pude responder en vivo. Dime qué producto quieres y tu CP/ZIP + país y te digo envío y cierre."
    );
  }
}

function initAiUI() {
  const input = $("#aiInput");
  const send = $("#aiSend");
  if (!input || !send) return;

  const sendNow = async () => {
    const v = input.value;
    input.value = "";
    await sendAiMessage(v);
  };

  send.addEventListener("click", sendNow);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendNow();
  });
}

/* -----------------------
   Service Worker (PWA)
------------------------ */
function registerSW() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register(`/sw.js?v=${BUILD_VERSION}`);
      // fuerza update (por si el browser trae uno viejo pegado)
      if (reg && typeof reg.update === "function") await reg.update();
    } catch (e) {
      console.warn("[sw]", e);
    }
  });
}

/* -----------------------
   INIT
------------------------ */
window.addEventListener("error", () => killSplash(true));
window.addEventListener("unhandledrejection", () => killSplash(true));

document.addEventListener("DOMContentLoaded", async () => {
  // failsafe: aunque algo truene, no te quedas atorado en intro
  setTimeout(() => killSplash(false), 900);

  // footer year
  const y = $("#year");
  if (y) y.textContent = String(new Date().getFullYear());

  initCookieBanner();
  initAiUI();

  // shipping initial UI
  applyShippingModeUI(STATE.ship.mode || "pickup");
  const miniZip = $("#miniZip");
  const heroZip = $("#shipZip");
  if (miniZip && STATE.ship.zip) miniZip.value = STATE.ship.zip;
  if (heroZip && STATE.ship.zip) heroZip.value = STATE.ship.zip;

  // Load catalog
  try {
    await loadCatalog();
    await renderGrid();
  } catch (e) {
    console.error("Error loading catalog", e);
    showToast("No se pudo cargar el catálogo");
  }

  // Filter chips
  $$(".chip").forEach((btn) => {
    btn.addEventListener("click", async () => {
      $$(".chip").forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      STATE.filter = String(btn.dataset.filter || "ALL");
      await renderGrid();
    });
  });

  // Persist cart
  saveCart();

  // Query params: success/cancel + openCart (PWA shortcuts)
  try {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const openCart = params.get("openCart");

    if (status === "success") {
      showToast("Pago exitoso. Gracias 🙌");
      STATE.cart = [];
      saveCart();
      // limpia query
      params.delete("status");
      const qs = params.toString();
      const next = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
      window.history.replaceState({}, document.title, next);
    }

    if (status === "cancel") {
      showToast("Pago cancelado");
      params.delete("status");
      const qs = params.toString();
      const next = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
      window.history.replaceState({}, document.title, next);
    }

    if (openCart === "1") {
      // leve delay para que ya esté pintado
      setTimeout(() => openDrawer(), 350);
    }
  } catch {}

  // Register SW
  registerSW();

  // done: hide splash hard (por si queda)
  killSplash(false);
});