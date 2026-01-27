// js/main.js — SCORE STORE (PROD 2026)
// Frontend estático + Netlify Functions
// - Catálogo: /data/catalog.json (NO se modifica)
// - Promos: /data/promos.json
// - Quote shipping: POST /api/quote
// - Checkout: POST /api/checkout
// - AI Chat: POST /api/chat

/* =========================
   GLOBALS / STATE
   ========================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const STATE = {
  products: [],
  promos: [],
  filter: "ALL",
  cart: [],
  shipping: {
    mode: "pickup",      // pickup | mx | us
    zip: "",
    quoteMXN: 0,
    label: "Pickup (Tijuana) — $0"
  },
  ui: {
    cartOpen: false,
    aiOpen: false,
    busyCheckout: false,
    busyQuote: false
  }
};

const LS_CART = "scorestore_cart_v3";
const LS_SHIP = "scorestore_ship_v3";
const SS_INTRO = "scorestore_intro_seen_v1";

/* =========================
   FORMAT
   ========================= */
function mxn(n) {
  const num = Number(n || 0);
  try {
    return num.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  } catch {
    return `$${num.toFixed(2)} MXN`;
  }
}

function clampInt(n, min = 1, max = 50) {
  const x = parseInt(n, 10);
  if (Number.isNaN(x)) return min;
  return Math.min(max, Math.max(min, x));
}

function toast(msg, ms = 2200) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el.__t);
  el.__t = setTimeout(() => el.classList.remove("show"), ms);
}

/* =========================
   STORAGE
   ========================= */
function loadCart() {
  try {
    const raw = localStorage.getItem(LS_CART);
    const arr = JSON.parse(raw || "[]");
    STATE.cart = Array.isArray(arr) ? arr : [];
  } catch {
    STATE.cart = [];
  }
}

function saveCart() {
  localStorage.setItem(LS_CART, JSON.stringify(STATE.cart));
}

function loadShipping() {
  try {
    const raw = localStorage.getItem(LS_SHIP);
    const obj = JSON.parse(raw || "{}");
    if (obj && typeof obj === "object") {
      STATE.shipping.mode = obj.mode || "pickup";
      STATE.shipping.zip = obj.zip || "";
      STATE.shipping.quoteMXN = Number(obj.quoteMXN || 0);
      STATE.shipping.label = obj.label || "Pickup (Tijuana) — $0";
    }
  } catch {}
}

function saveShipping() {
  localStorage.setItem(LS_SHIP, JSON.stringify({
    mode: STATE.shipping.mode,
    zip: STATE.shipping.zip,
    quoteMXN: STATE.shipping.quoteMXN,
    label: STATE.shipping.label
  }));
}

/* =========================
   FETCH HELPERS
   ========================= */
async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${txt || res.statusText}`);
  }
  return await res.json();
}

/* =========================
   CATALOG + PROMOS
   ========================= */
async function loadCatalog() {
  const data = await fetchJSON(`/data/catalog.json?ts=${Date.now()}`);
  const products = Array.isArray(data?.products) ? data.products : [];
  // Normaliza lo mínimo sin tocar el archivo
  STATE.products = products.map(p => ({
    id: String(p.id || "").trim(),
    name: String(p.name || "").trim(),
    category: String(p.category || "").trim(),
    baseMXN: Number(p.baseMXN || p.price || 0),
    img: String(p.img || "").trim(),
    sizes: Array.isArray(p.sizes) ? p.sizes : (p.sizeOptions || ["XS","S","M","L","XL"]),
    desc: String(p.desc || p.description || "").trim()
  })).filter(p => p.id && p.name && Number.isFinite(p.baseMXN) && p.baseMXN > 0);
}

async function loadPromos() {
  try {
    const data = await fetchJSON(`/data/promos.json?ts=${Date.now()}`);
    STATE.promos = Array.isArray(data?.promos) ? data.promos : [];
  } catch {
    STATE.promos = [];
  }
}

/* =========================
   FILTERS
   ========================= */
function setFilter(f) {
  STATE.filter = f;
  $$(".chip").forEach(btn => btn.classList.toggle("active", btn.dataset.filter === f));
  renderProducts();
  // micro UX: scroll suave a grid si viene de chip en móvil
  const grid = $("#productsGrid");
  if (grid && window.innerWidth < 700) {
    grid.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function bindFilters() {
  $$(".chip").forEach(btn => {
    btn.addEventListener("click", () => setFilter(btn.dataset.filter || "ALL"));
  });
}

/* =========================
   PRODUCT CARD
   ========================= */
function productMatchesFilter(p) {
  if (STATE.filter === "ALL") return true;
  // index usa filtros: EDICION_2025, BAJA1000, BAJA500, BAJA400, SF250, OTRAS_EDICIONES
  // mapeo flexible por category
  const c = (p.category || "").toUpperCase();
  const f = (STATE.filter || "").toUpperCase();

  if (f === "EDICION_2025") return c.includes("EDICION_2025") || c.includes("2025");
  if (f === "BAJA1000") return c.includes("BAJA1000") || c.includes("BAJA 1000");
  if (f === "BAJA500") return c.includes("BAJA500") || c.includes("BAJA 500");
  if (f === "BAJA400") return c.includes("BAJA400") || c.includes("BAJA 400");
  if (f === "SF250") return c.includes("SF250") || c.includes("SAN FELIPE") || c.includes("250");
  if (f === "OTRAS_EDICIONES") return c.includes("OTRAS") || c.includes("EDICIONES");

  // fallback: contains
  return c.includes(f);
}

function renderProducts() {
  const grid = $("#productsGrid");
  if (!grid) return;

  const list = STATE.products.filter(productMatchesFilter);
  if (!list.length) {
    grid.innerHTML = `<div style="padding:12px;color:#444">No hay productos en este filtro.</div>`;
    return;
  }

  grid.innerHTML = list.map(p => {
    const img = p.img ? p.img : "/assets/hero.webp";
    const sizes = (p.sizes || ["S","M","L","XL"]).map(s => `<option value="${String(s)}">${String(s)}</option>`).join("");
    return `
      <article class="card" data-id="${p.id}">
        <div class="cardImg">
          <img src="${img}" alt="${escapeHtml(p.name)}" loading="lazy">
        </div>
        <div class="cardBody">
          <div class="cardTitle">${escapeHtml(p.name)}</div>
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
            <div style="font-size:12px;color:#666">${escapeHtml(p.category || "SCORE")}</div>
            <div class="cardPrice">${mxn(p.baseMXN)}</div>
          </div>
          ${p.desc ? `<div style="font-size:13px;color:#555;line-height:1.35">${escapeHtml(p.desc)}</div>` : ``}
          <div class="cardControls">
            <select class="sizeSel" aria-label="Talla">
              ${sizes}
            </select>
            <button class="btn primary addBtn" type="button">
              <i class="fa-solid fa-plus"></i> Agregar
            </button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  // bind add buttons
  $$(".addBtn", grid).forEach(btn => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".card");
      const id = card?.dataset?.id;
      const size = $(".sizeSel", card)?.value || "M";
      addToCart(id, size);
      // micro anim pro: pulse
      card?.classList.add("pulse");
      setTimeout(() => card?.classList.remove("pulse"), 450);
    });
  });
}

/* =========================
   CART
   ========================= */
function cartKey(id, size) {
  return `${id}__${String(size || "M").toUpperCase()}`;
}

function addToCart(id, size) {
  const p = STATE.products.find(x => x.id === id);
  if (!p) return toast("Producto no disponible");

  const key = cartKey(id, size);
  const existing = STATE.cart.find(x => x.key === key);

  if (existing) {
    existing.qty = clampInt(existing.qty + 1, 1, 50);
  } else {
    STATE.cart.push({
      key,
      id: p.id,
      name: p.name,
      size: String(size || "M").toUpperCase(),
      priceMXN: p.baseMXN,
      img: p.img || "/assets/hero.webp",
      qty: 1
    });
  }

  saveCart();
  renderCart();
  bumpCartCount();
  toast("Agregado al carrito 🏁");
}

function removeFromCart(key) {
  STATE.cart = STATE.cart.filter(x => x.key !== key);
  saveCart();
  renderCart();
  bumpCartCount();
}

function changeQty(key, delta) {
  const it = STATE.cart.find(x => x.key === key);
  if (!it) return;
  it.qty = clampInt(it.qty + delta, 1, 50);
  saveCart();
  renderCart();
  bumpCartCount();
}

function subtotalMXN() {
  return STATE.cart.reduce((sum, it) => sum + (Number(it.priceMXN) * Number(it.qty)), 0);
}

function bumpCartCount() {
  const n = STATE.cart.reduce((sum, it) => sum + Number(it.qty || 0), 0);
  const el = $("#cartCount");
  if (el) el.textContent = String(n);
}

function openCart() {
  STATE.ui.cartOpen = true;
  $("#cartDrawer")?.classList.add("open");
  $("#backdrop")?.classList.add("show");
}

function closeCart() {
  STATE.ui.cartOpen = false;
  $("#cartDrawer")?.classList.remove("open");
  $("#backdrop")?.classList.remove("show");
}

window.openCart = openCart;
window.closeCart = closeCart;

function renderCart() {
  const itemsEl = $("#cartItems");
  if (!itemsEl) return;

  if (!STATE.cart.length) {
    itemsEl.innerHTML = `
      <div style="padding:18px;color:#444">
        <div style="font-weight:800;margin-bottom:6px">Tu carrito está vacío</div>
        <div style="font-size:13px;line-height:1.4;color:#666">
          Elige una edición (Baja 1000 / 500 / 400 / SF250) y agrega tu talla.
        </div>
      </div>
    `;
  } else {
    itemsEl.innerHTML = STATE.cart.map(it => `
      <div class="cartRow">
        <div style="display:flex;gap:10px;align-items:center;min-width:0">
          <img src="${it.img}" alt="" style="width:46px;height:46px;border-radius:12px;object-fit:cover;border:1px solid rgba(0,0,0,.06)">
          <div style="min-width:0">
            <div style="font-weight:800;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(it.name)}</div>
            <small>Talla: <b>${escapeHtml(it.size)}</b> · ${mxn(it.priceMXN)}</small>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="removeBtn" data-act="dec" data-key="${it.key}" title="Menos">−</button>
          <div style="min-width:20px;text-align:center;font-weight:900">${it.qty}</div>
          <button class="removeBtn" data-act="inc" data-key="${it.key}" title="Más">+</button>
          <button class="removeBtn" data-act="rm" data-key="${it.key}" title="Quitar">✕</button>
        </div>
      </div>
    `).join("");

    // bind qty/removes
    $$(".removeBtn", itemsEl).forEach(btn => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.key;
        const act = btn.dataset.act;
        if (act === "dec") changeQty(key, -1);
        if (act === "inc") changeQty(key, +1);
        if (act === "rm") removeFromCart(key);
      });
    });
  }

  // Totals
  const sub = subtotalMXN();
  $("#cartSubtotal") && ($("#cartSubtotal").textContent = mxn(sub));
  $("#cartShipping") && ($("#cartShipping").textContent = mxn(STATE.shipping.quoteMXN || 0));
  $("#cartTotal") && ($("#cartTotal").textContent = mxn(sub + (STATE.shipping.quoteMXN || 0)));

  // Mini ship label
  const miniLabel = $("#miniShipLabel");
  if (miniLabel) miniLabel.textContent = STATE.shipping.label || "";

  // set mode selector in drawer
  const modeSel = $("#shippingMode");
  if (modeSel) modeSel.value = STATE.shipping.mode || "pickup";

  const zipEl = $("#miniZip");
  if (zipEl && STATE.shipping.zip) zipEl.value = STATE.shipping.zip;
}

/* =========================
   PROMOS
   ========================= */
function applyPromo() {
  const code = ($("#promoCode")?.value || "").trim().toUpperCase();
  if (!code) return toast("Escribe un cupón");

  // Promos pueden venir del JSON, pero el descuento real lo aplica el servidor en checkout.
  const promo = STATE.promos.find(p => String(p.code || "").toUpperCase() === code);

  if (promo) {
    toast(`Cupón detectado: ${code}`);
  } else {
    // Igual lo dejamos pasar (por si promo es server-side)
    toast(`Cupón aplicado: ${code}`);
  }
}
window.applyPromo = applyPromo;

/* =========================
   SHIPPING (UI + MINI)
   ========================= */
async function quoteShipping(mode, zip) {
  if (STATE.ui.busyQuote) return;
  STATE.ui.busyQuote = true;

  try {
    const payload = {
      mode,
      country: mode === "us" ? "US" : "MX",
      zip,
      items: STATE.cart.map(it => ({ sku: it.id, qty: it.qty }))
    };

    const res = await fetchJSON("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res?.ok) throw new Error(res?.error || "No se pudo cotizar");

    const amount = Number(res.amount || 0);
    STATE.shipping.mode = mode;
    STATE.shipping.zip = zip;
    STATE.shipping.quoteMXN = Number.isFinite(amount) ? amount : 0;

    const label = (mode === "pickup")
      ? "Pickup (Tijuana) — $0"
      : `${res.carrier || "FedEx"} · ${res.service || "Standard"} — ${mxn(amount)} · ETA ${res.eta || ""}`.trim();

    STATE.shipping.label = label;

    saveShipping();
    renderCart();
    toast("Envío cotizado ✅");

    return res;
  } finally {
    STATE.ui.busyQuote = false;
  }
}

async function quoteShippingUI() {
  const country = ($("#shipCountry")?.value || "MX").toUpperCase();
  const zip = ($("#shipZip")?.value || "").trim();
  const box = $("#shipQuote");

  if (!STATE.cart.length) {
    toast("Agrega productos antes de cotizar");
    return openCart();
  }

  if (!zip) {
    toast("Escribe tu código postal");
    return;
  }

  const mode = country === "US" ? "us" : "mx";

  try {
    box && (box.textContent = "Cotizando…");
    const res = await quoteShipping(mode, zip);
    box && (box.textContent = `${res.carrier || "FedEx"} · ${res.service || "Standard"} — ${mxn(res.amount)} · ETA ${res.eta || ""}`);
  } catch (e) {
    box && (box.textContent = "");
    toast(e.message || "No se pudo cotizar");
  }
}
window.quoteShippingUI = quoteShippingUI;

async function quoteShippingMini() {
  const mode = ($("#shippingMode")?.value || "pickup").toLowerCase();
  const zip = ($("#miniZip")?.value || "").trim();

  if (!STATE.cart.length) {
    toast("Tu carrito está vacío");
    return;
  }

  if (mode === "pickup") {
    STATE.shipping.mode = "pickup";
    STATE.shipping.zip = "";
    STATE.shipping.quoteMXN = 0;
    STATE.shipping.label = "Pickup (Tijuana) — $0";
    saveShipping();
    renderCart();
    return toast("Pickup seleccionado");
  }

  if (!zip) return toast("Escribe el CP para envío");

  try {
    await quoteShipping(mode, zip);
  } catch (e) {
    toast(e.message || "No se pudo cotizar");
  }
}
window.quoteShippingMini = quoteShippingMini;

/* =========================
   CHECKOUT
   ========================= */
async function checkout() {
  if (STATE.ui.busyCheckout) return;
  if (!STATE.cart.length) return toast("Tu carrito está vacío");

  STATE.ui.busyCheckout = true;
  const btn = $("#checkoutBtn");
  const old = btn?.innerHTML;
  if (btn) btn.innerHTML = `Procesando…`;

  try {
    const promoCode = ($("#promoCode")?.value || "").trim().toUpperCase();

    // Si shipping != pickup, requiere zip (no inventamos)
    const shippingMode = (STATE.shipping.mode || "pickup").toLowerCase();
    const zip = (STATE.shipping.zip || $("#miniZip")?.value || "").trim();

    // Si el usuario eligió mx/us pero no cotizó todavía, forzamos cotización
    if ((shippingMode === "mx" || shippingMode === "us") && (!STATE.shipping.quoteMXN || STATE.shipping.quoteMXN <= 0)) {
      await quoteShipping(shippingMode, zip);
    }

    const payload = {
      cart: STATE.cart.map(it => ({
        id: it.id,
        size: it.size,
        qty: it.qty
      })),
      shippingMode,
      zip,
      promoCode
    };

    const res = await fetchJSON("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res?.ok) throw new Error(res?.error || "No se pudo iniciar checkout");

    if (res.url) {
      window.location.href = res.url; // Stripe Checkout
    } else {
      throw new Error("Stripe no devolvió URL");
    }

  } catch (e) {
    toast(e.message || "Error en checkout");
  } finally {
    STATE.ui.busyCheckout = false;
    if (btn) btn.innerHTML = old || `<i class="fa-solid fa-credit-card"></i> PAGAR`;
  }
}
window.checkout = checkout;

/* =========================
   AI ASSISTANT (UI)
   ========================= */
function toggleAiAssistant() {
  STATE.ui.aiOpen = !STATE.ui.aiOpen;
  const modal = $("#aiChatModal");
  if (!modal) return;

  modal.classList.toggle("show", STATE.ui.aiOpen);

  if (STATE.ui.aiOpen) {
    $("#aiInput")?.focus();
    if (!$("#aiMessages")?.dataset?.booted) {
      bootAiMessages();
    }
  }
}
window.toggleAiAssistant = toggleAiAssistant;

function bootAiMessages() {
  const box = $("#aiMessages");
  if (!box) return;
  box.dataset.booted = "1";
  addAiBubble("ai", "Soy SCORE AI 🏁. Dime tu talla y qué edición quieres (Baja 1000 / 500 / 400 / SF250). Te recomiendo rápido y te llevo al checkout.");
}

function addAiBubble(role, text) {
  const box = $("#aiMessages");
  if (!box) return;

  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.justifyContent = role === "me" ? "flex-end" : "flex-start";
  wrap.style.marginBottom = "10px";

  const bubble = document.createElement("div");
  bubble.style.maxWidth = "78%";
  bubble.style.padding = "10px 12px";
  bubble.style.borderRadius = "14px";
  bubble.style.boxShadow = "0 6px 18px rgba(0,0,0,.06)";
  bubble.style.whiteSpace = "pre-wrap";
  bubble.style.lineHeight = "1.35";
  bubble.style.fontSize = "14px";
  bubble.style.border = "1px solid rgba(0,0,0,.08)";
  if (role === "me") {
    bubble.style.background = "#111";
    bubble.style.color = "#fff";
  } else {
    bubble.style.background = "#fff";
    bubble.style.color = "#111";
  }

  bubble.textContent = text;
  wrap.appendChild(bubble);
  box.appendChild(wrap);
  box.scrollTop = box.scrollHeight;
}

async function sendAiMessage() {
  const input = $("#aiInput");
  const msg = (input?.value || "").trim();
  if (!msg) return;

  input.value = "";
  addAiBubble("me", msg);

  try {
    addAiBubble("ai", "Dame 2 segundos… 🏁");
    const res = await fetchJSON("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg })
    });

    // Borra el “typing” (último bubble ai si coincide)
    const box = $("#aiMessages");
    if (box) {
      const last = box.lastElementChild?.firstElementChild;
      if (last && last.textContent && last.textContent.includes("2 segundos")) {
        box.removeChild(box.lastElementChild);
      }
    }

    if (!res?.ok) throw new Error(res?.error || "Score AI no disponible");
    addAiBubble("ai", res.reply || "¿Qué edición y talla te interesan?");
  } catch (e) {
    // borra “typing”
    const box = $("#aiMessages");
    if (box) {
      const last = box.lastElementChild?.firstElementChild;
      if (last && last.textContent && last.textContent.includes("2 segundos")) {
        box.removeChild(box.lastElementChild);
      }
    }
    addAiBubble("ai", "Ahorita no estoy disponible. Igual puedo ayudarte: dime tu talla y si el envío es MX o USA.");
  }
}
window.sendAiMessage = sendAiMessage;

/* =========================
   INTRO (Tipo A) CONTROL
   ========================= */
function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function runIntro() {
  const intro = $("#intro");
  if (!intro) return;

  // Reglas:
  // - Solo una vez por sesión (SS_INTRO)
  // - Si reduced motion, skip automático
  if (sessionStorage.getItem(SS_INTRO) === "1") return;

  if (prefersReducedMotion()) {
    sessionStorage.setItem(SS_INTRO, "1");
    intro.classList.remove("show");
    return;
  }

  intro.classList.add("show");
  intro.setAttribute("aria-hidden", "false");

  const fill = $("#introBarFill");
  const skip = $("#introSkip");

  let t = 0;
  const duration = 1700; // ms — rápido, pro
  const start = performance.now();

  function frame(now) {
    t = Math.min(1, (now - start) / duration);
    if (fill) fill.style.width = `${Math.round(t * 100)}%`;
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      closeIntro();
    }
  }

  function closeIntro() {
    sessionStorage.setItem(SS_INTRO, "1");
    intro.classList.remove("show");
    intro.setAttribute("aria-hidden", "true");
  }

  skip?.addEventListener("click", closeIntro, { once: true });

  // click outside = skip
  intro.addEventListener("click", (e) => {
    if (e.target && (e.target.id === "intro" || e.target.classList.contains("introBg"))) closeIntro();
  });

  requestAnimationFrame(frame);
}

/* =========================
   URL STATUS (Stripe redirect)
   ========================= */
function handleStatusFromURL() {
  const u = new URL(window.location.href);
  const status = u.searchParams.get("status");
  if (!status) return;

  if (status === "success") {
    toast("Pago confirmado ✅ ¡Gracias! 🏁", 2800);
    // Limpia carrito
    STATE.cart = [];
    saveCart();

    // Limpia URL
    u.searchParams.delete("status");
    window.history.replaceState({}, "", u.toString());

    renderCart();
    bumpCartCount();
  }

  if (status === "cancel") {
    toast("Pago cancelado. Puedes intentar de nuevo.", 2400);
    u.searchParams.delete("status");
    window.history.replaceState({}, "", u.toString());
  }
}

/* =========================
   NAV ACTIVE (pequeño)
   ========================= */
function bindNavActive() {
  const links = $$(".nav a");
  const sections = ["catalogo", "envios", "faq"].map(id => document.getElementById(id)).filter(Boolean);

  function onScroll() {
    const y = window.scrollY + 120;
    let active = "";
    for (const s of sections) {
      if (s.offsetTop <= y) active = s.id;
    }
    links.forEach(a => {
      const href = a.getAttribute("href") || "";
      a.classList.toggle("active", active && href === `#${active}`);
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/* =========================
   ESCAPE HTML
   ========================= */
function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   BIND UI EVENTS
   ========================= */
function bindUI() {
  $("#cartBtn")?.addEventListener("click", openCart);

  // Close on ESC
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (STATE.ui.aiOpen) toggleAiAssistant();
      if (STATE.ui.cartOpen) closeCart();
    }
  });

  // Shipping mode change in drawer updates state (no quote until user clicks)
  $("#shippingMode")?.addEventListener("change", (e) => {
    const m = String(e.target.value || "pickup").toLowerCase();
    STATE.shipping.mode = m;
    if (m === "pickup") {
      STATE.shipping.quoteMXN = 0;
      STATE.shipping.zip = "";
      STATE.shipping.label = "Pickup (Tijuana) — $0";
      saveShipping();
      renderCart();
    } else {
      // Just hint
      toast("Cotiza el envío con tu CP");
    }
  });
}

/* =========================
   INIT
   ========================= */
(async function init() {
  loadCart();
  loadShipping();
  bumpCartCount();

  try {
    await Promise.all([loadCatalog(), loadPromos()]);
    bindFilters();
    bindUI();
    bindNavActive();
    renderProducts();
    renderCart();
    handleStatusFromURL();
    runIntro();
  } catch (e) {
    console.error(e);
    toast("Error cargando catálogo");
  }
})();