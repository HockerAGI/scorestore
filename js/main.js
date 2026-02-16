/* =========================================================
   SCORE STORE — MASTER JS PROD 2026 (UNIFIED 360)
   FIXES:
   - Catálogo robusto + chips dinámicos (BAJA 400 / SF 250)
   - Carrito + Totales correctos (Subtotal + Envío)
   - Envío: Pickup / MX / USA + cotizador real (/.netlify/functions/quote_shipping)
   - Checkout: envía shipping data al backend (create_checkout)
   - Legal modal: Terms + Privacy (fetch /legal.html con fallback)
   - Cookie banner (persistente)
   - AI chat UI (Gemini endpoint /chat) con fallback
   - PWA: registra sw.js + soporta openCart=1 y status=success/cancel
   ========================================================= */

const CONFIG = {
  // Stripe publishable (NO se usa directo; checkout redirige por URL del backend)
  stripeKey: "pk_live_51STepg1ExTx11WqTGdkk68CLhZHqnBkIAzE2EacmhSR336HvR9nQY5dskyPWotJ6AExFjstC7C7wUTsOIIzRGols00hFSwI8yp",

  // Integraciones server-side (Netlify functions)
  endpoints: {
    checkout: "/api/checkout", // redirect a /.netlify/functions/create_checkout
    quote: "/api/quote",       // redirect a /.netlify/functions/quote_shipping
    ai: "/api/chat"            // redirect a /.netlify/functions/chat
  },

  storageKey: "score_cart_2026",
  catalogUrl: "/data/catalog.json",
  promosUrl: "/data/promos.json", // future
  cookieKey: "cookieConsent"
};

const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);

const fmtMXN = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));

const STATE = {
  cart: safeJson(localStorage.getItem(CONFIG.storageKey), []),
  products: [],
  sections: [],
  filter: "ALL",

  shipping: {
    mode: "pickup",    // pickup | mx | us
    country: "MX",     // MX | US
    zip: "",
    amount: 0,
    label: "Pickup Gratis",
    quoted: true
  },

  legalCacheHtml: null
};

/* =========================================================
   UTIL
   ========================================================= */
function safeJson(str, fallback) {
  try {
    const v = JSON.parse(str);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function toast(msg) {
  if (typeof window.showToastCompat === "function") return window.showToastCompat(msg);
  const el = $("#toast");
  if (!el) return;
  el.textContent = String(msg || "");
  el.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

async function postJSON(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(err);
  }
  return data;
}

function qtyInCart() {
  return (STATE.cart || []).reduce((a, b) => a + Number(b.qty || 0), 0);
}

function subtotalCart() {
  return (STATE.cart || []).reduce((a, b) => a + Number(b.price || 0) * Number(b.qty || 0), 0);
}

function setText(sel, value) {
  const el = typeof sel === "string" ? $(sel) : sel;
  if (!el) return;
  el.textContent = value;
}

function setHTML(sel, value) {
  const el = typeof sel === "string" ? $(sel) : sel;
  if (!el) return;
  el.innerHTML = value;
}

/* =========================================================
   CART
   ========================================================= */
function saveCart() {
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(STATE.cart || []));
  const qty = qtyInCart();
  $$(".cartCount").forEach((el) => (el.textContent = qty));
  updateDrawerUI();
  updateTotalsUI();
}

function updateDrawerUI() {
  const container = $("#cartItems");
  if (!container) return;

  container.innerHTML = (STATE.cart && STATE.cart.length)
    ? ""
    : "<p style='text-align:center;padding:20px;opacity:0.6;'>Tu carrito está vacío</p>";

  (STATE.cart || []).forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "cartRow";
    row.innerHTML = `
      <div class="cartThumb"><img src="${escapeAttr(item.img)}" alt=""></div>
      <div class="cartInfo">
        <div class="name">${escapeHtml(item.name)}</div>
        <div class="price">${fmtMXN(item.price)} x ${Number(item.qty || 1)}</div>
        <div style="font-size:10px;opacity:0.6;">Talla: ${escapeHtml(item.size || "Unitalla")}</div>
      </div>
      <button class="removeBtn" type="button" aria-label="Eliminar" onclick="removeFromCart(${idx})"
        style="color:var(--score-red);font-weight:bold;padding:5px;">✕</button>
    `;
    container.appendChild(row);
  });
}

function updateTotalsUI() {
  const sub = subtotalCart();
  const ship = Number(STATE.shipping.amount || 0);
  const total = sub + ship;

  setText("#cartSubtotal", fmtMXN(sub));
  setText("#cartShipping", fmtMXN(ship));
  setText("#cartTotal", fmtMXN(total));

  // label
  setText("#cartShipLabel", STATE.shipping.label || "Envío");
  // hero quote label
  const shipQuote = $("#shipQuote");
  if (shipQuote) shipQuote.textContent = STATE.shipping.quoted
    ? `${STATE.shipping.label}: ${fmtMXN(ship)}`
    : "";
}

window.removeFromCart = (idx) => {
  STATE.cart.splice(idx, 1);
  // si el carrito quedó vacío, reset shipping a pickup
  if (!STATE.cart.length) setShippingMode("pickup", { silent: true });
  saveCart();
};

function addToCart(id) {
  const p = (STATE.products || []).find((x) => x.id === id);
  if (!p) return;

  const safeId = String(p.id || "").replace(/[^a-z0-9]/gi, "");
  const size = $(`#size-${safeId}`)?.value || "Unitalla";

  const key = `${id}-${size}`;
  const ex = (STATE.cart || []).find((i) => i.key === key);

  if (ex) ex.qty = Number(ex.qty || 1) + 1;
  else {
    STATE.cart.push({
      key,
      id: p.id,
      name: p.name,
      price: Number(p.baseMXN || 0),
      img: p.img,
      size,
      qty: 1
    });
  }

  // shipping quote queda stale si cambió qty
  if (STATE.shipping.mode !== "pickup") STATE.shipping.quoted = false;

  saveCart();
  openDrawer();
}
window.addToCart = addToCart;

/* =========================================================
   DRAWER
   ========================================================= */
function openDrawer() {
  $("#cartDrawer")?.classList.add("open");
  $("#pageOverlay")?.classList.add("show");
  document.body.classList.add("no-scroll");
}
function closeDrawer() {
  $("#cartDrawer")?.classList.remove("open");
  $("#pageOverlay")?.classList.remove("show");
  document.body.classList.remove("no-scroll");
}
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;

/* =========================================================
   CATALOGO + FILTROS
   ========================================================= */
function normalizeSectionTitle(t) {
  return String(t || "").replace(/\s+/g, " ").trim();
}

function ensureSectionChips() {
  const host = $(".filters");
  if (!host || !Array.isArray(STATE.sections)) return;

  const existing = new Set(
    Array.from($$(".chip"))
      .map((b) => String(b.dataset.filter || "").toUpperCase())
      .filter(Boolean)
  );

  // Agrega chips para cada sección del JSON si no existe
  STATE.sections.forEach((s) => {
    const id = String(s.id || "").toUpperCase();
    if (!id || existing.has(id)) return;
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.type = "button";
    btn.dataset.filter = id;
    btn.textContent = normalizeSectionTitle(s.title || id.replaceAll("_", " "));
    host.appendChild(btn);
    existing.add(id);
  });

  bindChipEvents(); // re-bind (incluye nuevos)
}

function bindChipEvents() {
  $$(".chip").forEach((btn) => {
    if (btn.__bound) return;
    btn.__bound = true;
    btn.addEventListener("click", () => {
      $$(".chip").forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      STATE.filter = String(btn.dataset.filter || "ALL").toUpperCase();
      renderGrid();
    });
  });
}

function renderGrid() {
  const grid = $("#productsGrid");
  if (!grid) return;

  const list = Array.isArray(STATE.products) ? STATE.products : [];
  const filtered = list.filter((p) => {
    const section = String(p.sectionId || "").toUpperCase();
    if (STATE.filter === "ALL") return true;

    // chips fijas por categoría
    if (STATE.filter === "HOODIES") return p.subSection === "Hoodies";
    if (STATE.filter === "TEES") return p.subSection === "Camisetas";
    if (STATE.filter === "CAPS") return p.subSection === "Gorras";

    // chips por evento
    return section === STATE.filter;
  });

  if (!filtered.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1; padding:18px; border:1px dashed rgba(0,0,0,.2); border-radius:16px; background:rgba(255,255,255,.7)">
        <b>No hay productos en este filtro.</b>
        <div style="opacity:.7; margin-top:6px">Prueba con “Todo”.</div>
      </div>
    `;
    return;
  }

  grid.innerHTML = "";
  filtered.forEach((p) => {
    const safeId = String(p.id || "").replace(/[^a-z0-9]/gi, "");
    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
      <div class="p-media"><img src="${escapeAttr(p.img)}" alt="${escapeAttr(p.name)}" loading="lazy"></div>
      <div class="p-body">
        <div class="p-top">
          <h3 class="p-name">${escapeHtml(p.name)}</h3>
          <span class="p-price">${fmtMXN(p.baseMXN)}</span>
        </div>
        <select id="size-${safeId}" class="p-size-sel" aria-label="Talla">
          ${(p.sizes || ["Unitalla"]).map((s) => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join("")}
        </select>
        <button class="p-btn-add" type="button" onclick="addToCart('${escapeAttr(p.id)}')">AGREGAR AL CARRITO</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

/* =========================================================
   SHIPPING UI
   ========================================================= */
function normalizeZip(input) {
  return String(input || "").replace(/[^\d]/g, "").slice(0, 5);
}

function syncZipInputs(zip) {
  const z = normalizeZip(zip);
  const a = $("#shipZip");
  const b = $("#miniZip");
  if (a) a.value = z;
  if (b) b.value = z;
}

function syncShipRadios(mode) {
  // hero radios
  const hero = $$("input[name='shipModeHero']");
  hero.forEach((r) => (r.checked = r.value === mode));

  // drawer radios
  const dr = $$("input[name='shipMode']");
  dr.forEach((r) => (r.checked = r.value === mode));
}

function setShippingMode(mode, opts = {}) {
  const m = (mode || "pickup").toLowerCase();

  STATE.shipping.mode = m;
  STATE.shipping.quoted = (m === "pickup");

  if (m === "us") STATE.shipping.country = "US";
  else STATE.shipping.country = "MX";

  if (m === "pickup") {
    STATE.shipping.amount = 0;
    STATE.shipping.label = "Pickup Gratis";
  } else {
    STATE.shipping.amount = 0;
    STATE.shipping.label = (m === "us") ? "Cotiza envío (USA)" : "Cotiza envío (MX)";
  }

  syncShipRadios(m);

  // zip inputs show/hide
  const zipWrap = $("#shipZipWrap");
  const zipRow = $("#zipRow");
  if (zipWrap) zipWrap.style.display = (m === "pickup") ? "none" : "block";
  if (zipRow) zipRow.style.display = (m === "pickup") ? "none" : "flex";

  if (!opts.silent) updateTotalsUI();
}
window.toggleShipping = (mode) => setShippingMode(mode);

/**
 * Cotiza shipping y actualiza:
 * - hero quote
 * - drawer label + amount
 * - totals
 */
async function quoteShippingUI() {
  if (!STATE.cart.length) {
    toast("Tu carrito está vacío.");
    return;
  }

  const mode = STATE.shipping.mode;

  if (mode === "pickup") {
    STATE.shipping.amount = 0;
    STATE.shipping.label = "Pickup Gratis";
    STATE.shipping.quoted = true;
    updateTotalsUI();
    toast("Pickup seleccionado.");
    return;
  }

  // toma zip desde el input que tenga valor
  const zip = normalizeZip($("#miniZip")?.value || $("#shipZip")?.value || STATE.shipping.zip);
  if (zip.length !== 5) {
    toast("Pon un CP/ZIP de 5 dígitos.");
    return;
  }

  // guarda zip en state + inputs
  STATE.shipping.zip = zip;
  syncZipInputs(zip);

  const items = (STATE.cart || []).map((it) => ({ id: it.id, qty: Number(it.qty || 1) }));

  try {
    const data = await postJSON(CONFIG.endpoints.quote, {
      zip,
      country: STATE.shipping.country,
      items
    });

    const amount = Number(data.amount || 0);
    const label = String(data.label || "Envío");

    STATE.shipping.amount = Math.max(0, Math.round(amount));
    STATE.shipping.label = label;
    STATE.shipping.quoted = true;

    updateTotalsUI();
    toast(`${label}: ${fmtMXN(STATE.shipping.amount)}`);
  } catch (e) {
    console.error("[quote] error:", e);
    STATE.shipping.amount = 0;
    STATE.shipping.label = (STATE.shipping.country === "US") ? "Envío (USA)" : "Envío (MX)";
    STATE.shipping.quoted = false;
    updateTotalsUI();
    toast("No pude cotizar ahorita. Intenta otra vez.");
  }
}
window.quoteShippingUI = quoteShippingUI;

/* =========================================================
   CHECKOUT
   ========================================================= */
window.doCheckout = async () => {
  const btn = $("#checkoutBtn");
  if (!STATE.cart.length) return toast("Agrega productos al carrito.");

  // si no es pickup y no está cotizado, intenta cotizar (obligatorio)
  if (STATE.shipping.mode !== "pickup" && !STATE.shipping.quoted) {
    await quoteShippingUI();
    if (!STATE.shipping.quoted) return; // no avanzamos si no hay quote
  }

  const shippingData = {
    zip: STATE.shipping.zip || "",
    postal_code: STATE.shipping.zip || "",
    country: STATE.shipping.country || "MX"
  };

  const payload = {
    cart: STATE.cart,
    shipping: Number(STATE.shipping.amount || 0),
    shippingLabel: STATE.shipping.label,
    shippingMode: STATE.shipping.mode,
    shippingData
  };

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "PROCESANDO...";
    }

    const data = await postJSON(CONFIG.endpoints.checkout, payload);

    if (data?.url) {
      window.location.href = data.url;
      return;
    }

    throw new Error("No se recibió URL de pago.");
  } catch (e) {
    console.error("[checkout] error:", e);
    toast(`Checkout falló: ${e.message || "Error"}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "PAGAR AHORA";
    }
  }
};

/* =========================================================
   LEGAL MODAL (fetch legal.html, extrae secciones #terms/#privacy)
   ========================================================= */
function buildLegalFallback(which) {
  if (which === "privacy") {
    return {
      title: "AVISO DE PRIVACIDAD",
      body: `
        <p><b>Responsable:</b> BAJATEX S. DE R.L. DE C.V. (Único Uniformes), Tijuana, BC.</p>
        <p><b>Uso:</b> Datos para procesar compra, envío, facturación (si aplica) y soporte.</p>
        <p><b>Compartición:</b> Solo con proveedores necesarios (Stripe, paquetería/Envia.com) para completar tu pedido.</p>
        <p><b>Derechos:</b> Puedes solicitar acceso/rectificación/cancelación al correo: <b>ventas.unicotextil@gmail.com</b>.</p>
      `
    };
  }
  return {
    title: "TÉRMINOS Y CONDICIONES",
    body: `
      <p><b>Operación/Fabricación:</b> Único Uniformes (BAJATEX S. de R.L. de C.V.) bajo licencia oficial de SCORE International.</p>
      <p><b>Pagos:</b> Procesados por Stripe (tarjeta) y OXXO cuando esté disponible.</p>
      <p><b>Envíos:</b> Cotización estimada o en vivo según disponibilidad. Pickup Tijuana disponible cuando aplique.</p>
      <p><b>Devoluciones:</b> Cambios por defecto de fábrica dentro de 15 días naturales (aplica evidencia).</p>
    `
  };
}

async function loadLegalHtmlOnce() {
  if (STATE.legalCacheHtml) return STATE.legalCacheHtml;
  try {
    const res = await fetch("/legal.html", { cache: "no-store" });
    const html = await res.text();
    STATE.legalCacheHtml = html;
    return html;
  } catch {
    return null;
  }
}

function extractSectionFromLegal(html, which) {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const id = (which === "privacy") ? "privacy" : "terms";
    const node = doc.getElementById(id);
    const title = node?.querySelector("h2,h1")?.textContent || (which === "privacy" ? "AVISO DE PRIVACIDAD" : "TÉRMINOS Y CONDICIONES");
    const body = node ? node.innerHTML : "";
    return { title, body };
  } catch {
    return null;
  }
}

function openLegal(which) {
  const modal = $("#legalModal");
  const body = $("#legalBody");
  const title = $("#legalTitle");
  if (!modal || !body || !title) return;

  // show now (luego llenamos)
  modal.classList.add("show", "active");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("no-scroll");

  // fill async
  (async () => {
    const html = await loadLegalHtmlOnce();
    const extracted = html ? extractSectionFromLegal(html, which) : null;
    const fallback = buildLegalFallback(which);

    title.textContent = extracted?.title || fallback.title;
    body.innerHTML = extracted?.body || fallback.body;
  })();
}

function closeLegal() {
  const modal = $("#legalModal");
  if (!modal) return;
  modal.classList.remove("show", "active");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("no-scroll");
}

window.openLegal = openLegal;
window.closeLegal = closeLegal;
window.openLegalCompat = window.openLegalCompat || openLegal;
window.closeLegalCompat = window.closeLegalCompat || closeLegal;

/* =========================================================
   COOKIES
   ========================================================= */
function acceptCookies() {
  try { localStorage.setItem(CONFIG.cookieKey, "1"); } catch {}
  const b = $("#cookieBanner");
  if (b) b.style.display = "none";
}
window.acceptCookies = acceptCookies;
window.acceptCookiesCompat = window.acceptCookiesCompat || acceptCookies;

function initCookieBanner() {
  const b = $("#cookieBanner");
  if (!b) return;
  let ok = false;
  try { ok = localStorage.getItem(CONFIG.cookieKey) === "1"; } catch {}
  b.style.display = ok ? "none" : "flex";
}

/* =========================================================
   AI CHAT UI
   ========================================================= */
function aiAddMessage(role, text) {
  const wrap = $("#aiMsgs");
  if (!wrap) return;

  const item = document.createElement("div");
  item.className = `ai-msg ${role === "user" ? "ai-me" : "ai-bot"}`;
  item.textContent = String(text || "");
  wrap.appendChild(item);
  wrap.scrollTop = wrap.scrollHeight;
}

async function aiSend() {
  const input = $("#aiInput");
  const msg = String(input?.value || "").trim();
  if (!msg) return;

  if (input) input.value = "";
  aiAddMessage("user", msg);

  try {
    const data = await postJSON(CONFIG.endpoints.ai, { message: msg });
    aiAddMessage("bot", data?.reply || "Listo. ¿Qué talla y a dónde lo enviamos?");
  } catch (e) {
    console.error("[ai] error:", e);
    aiAddMessage("bot", "Ahorita no puedo consultar el asistente en vivo. Dime tu talla + CP/ZIP + país y te cierro la compra.");
  }
}

function initAIChat() {
  const sendBtn = $("#aiSend");
  const input = $("#aiInput");

  if (sendBtn && !sendBtn.__bound) {
    sendBtn.__bound = true;
    sendBtn.addEventListener("click", aiSend);
  }
  if (input && !input.__bound) {
    input.__bound = true;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") aiSend();
    });
  }
}

/* =========================================================
   PWA: service worker + query params
   ========================================================= */
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost") return;

  navigator.serviceWorker.register("/sw.js").catch((e) => {
    console.warn("[sw] register fail:", e?.message || e);
  });
}

function handleQueryParams() {
  const qs = new URLSearchParams(location.search);

  // open cart (PWA shortcut)
  if (qs.get("openCart") === "1") {
    setTimeout(() => openDrawer(), 250);
  }

  // stripe result
  const status = qs.get("status");
  if (status === "success") {
    toast("✅ Pago confirmado. Gracias. Te contactamos para seguimiento.");
    STATE.cart = [];
    saveCart();
    // limpia param sin recargar
    qs.delete("status");
    history.replaceState({}, "", `${location.pathname}${qs.toString() ? "?" + qs.toString() : ""}${location.hash || ""}`);
  } else if (status === "cancel") {
    toast("Pago cancelado. Tu carrito sigue listo.");
    qs.delete("status");
    history.replaceState({}, "", `${location.pathname}${qs.toString() ? "?" + qs.toString() : ""}${location.hash || ""}`);
  }
}

/* =========================================================
   SECURITY HELPERS (simple)
   ========================================================= */
function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function escapeAttr(s) {
  return escapeHtml(String(s || "")).replace(/`/g, "&#096;");
}

/* =========================================================
   INIT
   ========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  // Splash removal
  const splash = $("#splash");
  if (splash) {
    setTimeout(() => {
      splash.style.transition = "opacity 0.5s ease";
      splash.style.opacity = "0";
      setTimeout(() => (splash.style.display = "none"), 500);
    }, 800);
  }

  // Cookie banner
  initCookieBanner();

  // Bind shipping radios (hero + drawer)
  $$("input[name='shipModeHero']").forEach((r) => {
    r.addEventListener("change", () => setShippingMode(r.value));
  });
  $$("input[name='shipMode']").forEach((r) => {
    r.addEventListener("change", () => setShippingMode(r.value));
  });

  // Bind quote buttons (hero + drawer)
  $("#shipQuoteBtn")?.addEventListener("click", quoteShippingUI);
  $("#miniZip")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") quoteShippingUI();
  });
  $("#shipZip")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") quoteShippingUI();
  });

  // Init AI
  initAIChat();

  // Load catalog
  try {
    const res = await fetch(CONFIG.catalogUrl, { cache: "no-store" });
    const data = await res.json();

    STATE.sections = Array.isArray(data.sections) ? data.sections : [];
    STATE.products = Array.isArray(data.products)
      ? data.products.map((p) => ({
          ...p,
          sectionId: String(p.sectionId || "").toUpperCase()
        }))
      : [];

    ensureSectionChips();
    bindChipEvents();
    renderGrid();
  } catch (e) {
    console.error("[catalog] Error loading catalog", e);
    setHTML(
      "#productsGrid",
      `<div style="grid-column:1/-1; padding:18px; border:1px dashed rgba(0,0,0,.2); border-radius:16px; background:rgba(255,255,255,.7)">
        <b>Catálogo no disponible.</b>
        <div style="opacity:.7; margin-top:6px">Revisa /data/catalog.json y la consola.</div>
      </div>`
    );
  }

  // Restore cart count & totals
  saveCart();

  // Default shipping is pickup
  setShippingMode("pickup", { silent: true });
  updateTotalsUI();

  // PWA
  registerSW();
  handleQueryParams();

  // ESC close legal / drawer
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeLegal();
    closeDrawer();
  });
});
