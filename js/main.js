/* =========================================================
   SCORE STORE — MAIN JS (PROD)
   - Catálogo (data/catalog.json)
   - Carrito (drawer)
   - Envíos (Envia quote)
   - Checkout (Stripe via Netlify Function)
   - Score AI (Gemini via Netlify Function)
   - Intro Racing (Tipo A)
   ========================================================= */

const API = {
  checkout: "/api/checkout",
  quote: "/api/quote",
  chat: "/api/chat"
};

const STORAGE_KEYS = {
  cart: "score_cart",
  introSeen: "score_intro_seen"
};

let catalog = [];
let cart = [];
let promoApplied = null;       // { code, type, value } o null
let shippingQuote = null;      // { mxn, carrier, eta, raw? } o null

/* -------------------- DOM HELPERS ---------------------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function safeText(str) {
  return String(str ?? "").replace(/[<>&"]/g, (c) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;"
  }[c]));
}

/* -------------------- UI HELPERS ----------------------- */
function money(n) {
  const num = Number(n || 0);
  return "$" + num.toLocaleString("es-MX");
}

function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2600);
}

/* =========================================================
   INTRO (Tipo A) — PRO
   ========================================================= */
function shouldShowIntro() {
  try {
    return !localStorage.getItem(STORAGE_KEYS.introSeen);
  } catch {
    return true;
  }
}
function markIntroSeen() {
  try { localStorage.setItem(STORAGE_KEYS.introSeen, "1"); } catch {}
}

function showIntro() {
  const intro = $("#intro");
  const skip = $("#introSkip");
  const bar = $("#introBarFill");
  if (!intro || !skip || !bar) return;

  intro.classList.add("show");
  intro.setAttribute("aria-hidden", "false");

  const D = 2400; // duración total
  let start = null;
  let raf = null;
  let closed = false;

  const closeIntro = () => {
    if (closed) return;
    closed = true;

    if (raf) cancelAnimationFrame(raf);
    markIntroSeen();
    intro.classList.add("hide");
    intro.setAttribute("aria-hidden", "true");

    setTimeout(() => {
      intro.classList.remove("show", "hide");
      bar.style.width = "0%";
    }, 430);
  };

  const tick = (t) => {
    if (!start) start = t;
    const p = Math.min(1, (t - start) / D);
    bar.style.width = (p * 100).toFixed(2) + "%";
    if (p < 1) raf = requestAnimationFrame(tick);
    else closeIntro();
  };

  raf = requestAnimationFrame(tick);

  skip.onclick = closeIntro;

  // Clic fuera de la tarjeta cierra
  intro.onclick = (e) => {
    if (e.target === intro) closeIntro();
  };

  // ESC cierra
  const onKey = (e) => {
    if (e.key === "Escape") {
      closeIntro();
      window.removeEventListener("keydown", onKey);
    }
  };
  window.addEventListener("keydown", onKey);
}

/* =========================================================
   CART STORAGE
   ========================================================= */
function loadCart() {
  try {
    cart = JSON.parse(localStorage.getItem(STORAGE_KEYS.cart)) || [];
    if (!Array.isArray(cart)) cart = [];
  } catch {
    cart = [];
  }
}

function saveCart() {
  try { localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart)); } catch {}
  updateCartUI();
}

/* =========================================================
   CART DRAWER
   ========================================================= */
function openCart() {
  const drawer = $("#cartDrawer");
  const backdrop = $("#backdrop");
  if (drawer) drawer.classList.add("open");
  if (backdrop) backdrop.classList.add("show");
}

function closeCart() {
  const drawer = $("#cartDrawer");
  const backdrop = $("#backdrop");
  if (drawer) drawer.classList.remove("open");
  if (backdrop) backdrop.classList.remove("show");
}

/* Exponer para onclick inline del HTML */
window.openCart = openCart;
window.closeCart = closeCart;

/* =========================================================
   CART LOGIC
   ========================================================= */
function cartCount() {
  return cart.reduce((a, b) => a + (Number(b.qty) || 0), 0);
}

function cartSubtotal() {
  return cart.reduce((a, b) => a + (Number(b.price) || 0) * (Number(b.qty) || 0), 0);
}

function updateCartUI() {
  const list = $("#cartItems");
  const countEl = $("#cartCount");

  if (countEl) countEl.textContent = String(cartCount());

  if (!list) return;
  list.innerHTML = "";

  if (!cart.length) {
    list.innerHTML = `<div class="cartRow"><div><b>Carrito vacío</b><br><small>Agrega productos del catálogo.</small></div></div>`;
  } else {
    cart.forEach((item, idx) => {
      const row = document.createElement("div");
      row.className = "cartRow";
      row.innerHTML = `
        <div>
          <b>${safeText(item.name)}</b><br>
          <small>Talla: ${safeText(item.size)}</small>
        </div>
        <div style="text-align:right;">
          <div>${money(item.price)} <small>x ${item.qty}</small></div>
          <button data-i="${idx}" class="removeBtn" type="button" aria-label="Eliminar">✕</button>
        </div>
      `;
      list.appendChild(row);
    });

    list.querySelectorAll(".removeBtn").forEach((btn) => {
      btn.onclick = () => {
        const i = Number(btn.dataset.i);
        if (Number.isNaN(i)) return;
        cart.splice(i, 1);
        // Si se vacía el carrito, también reseteamos shipping quote
        if (!cart.length) shippingQuote = null;
        saveCart();
      };
    });
  }

  const sub = cartSubtotal();
  const ship = shippingQuote?.mxn ? Number(shippingQuote.mxn) : 0;
  const total = sub + ship;

  const subtotalEl = $("#cartSubtotal");
  const shippingEl = $("#cartShipping");
  const totalEl = $("#cartTotal");

  if (subtotalEl) subtotalEl.textContent = money(sub);
  if (shippingEl) shippingEl.textContent = money(ship);
  if (totalEl) totalEl.textContent = money(total);
}

/* =========================================================
   CATALOG
   ========================================================= */
async function loadCatalog() {
  const res = await fetch("/data/catalog.json", { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo cargar catalog.json");
  const data = await res.json();

  // NO modificamos tu catalog.json. Solo lo leemos.
  catalog = Array.isArray(data?.products) ? data.products : [];

  renderProducts("ALL");
}

function renderProducts(filter = "ALL") {
  const grid = $("#productsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const items = catalog.filter((p) => {
    if (filter === "ALL") return true;
    return String(p.category || "").toUpperCase() === String(filter).toUpperCase();
  });

  if (!items.length) {
    grid.innerHTML = `<div class="card"><div class="cardBody"><b>Sin productos</b><div class="muted">No hay productos en esta categoría.</div></div></div>`;
    return;
  }

  items.forEach((p) => {
    const id = p.id;
    const name = p.name;
    const img = p.img;
    const baseMXN = Number(p.baseMXN || p.price || 0);

    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <div class="cardImg">
        <img src="${safeText(img)}" alt="${safeText(name)}" loading="lazy">
      </div>
      <div class="cardBody">
        <div class="cardTitle">${safeText(name)}</div>
        <div class="cardPrice">${money(baseMXN)}</div>

        <div class="cardControls">
          <select data-size aria-label="Talla">
            <option value="S">S</option>
            <option value="M" selected>M</option>
            <option value="L">L</option>
            <option value="XL">XL</option>
            <option value="XXL">XXL</option>
          </select>
          <button class="btn primary" type="button">
            <i class="fa-solid fa-plus"></i> Agregar
          </button>
        </div>
      </div>
    `;

    card.querySelector("button").onclick = () => {
      const size = card.querySelector("[data-size]")?.value || "M";
      addToCart({ id, name, baseMXN }, size);
    };

    grid.appendChild(card);
  });
}

function addToCart(product, size) {
  const id = String(product.id);
  const name = String(product.name);
  const price = Number(product.baseMXN || 0);

  if (!id || !name || !price) {
    toast("Producto inválido");
    return;
  }

  const found = cart.find((i) => i.id === id && i.size === size);
  if (found) {
    found.qty += 1;
  } else {
    cart.push({ id, name, size, price, qty: 1 });
  }

  toast("Producto agregado 🏁");
  saveCart();
  openCart();
}

/* =========================================================
   FILTERS
   ========================================================= */
function initFilters() {
  const chips = $$(".chip");
  chips.forEach((chip) => {
    chip.onclick = () => {
      chips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      renderProducts(chip.dataset.filter || "ALL");
    };
  });
}

/* =========================================================
   PROMOS
   ========================================================= */
function applyPromo() {
  const input = $("#promoCode");
  if (!input) return;
  const code = input.value.trim().toUpperCase();
  if (!code) return toast("Ingresa un cupón");

  // Ejemplo: SCORE25
  if (code === "SCORE25") {
    promoApplied = { code, type: "percent", value: 0.25 };

    // Nota: el descuento REAL se valida server-side en create_checkout.js.
    // Aquí solo hacemos una vista previa en UI para que se sienta pro.
    // Para evitar doble-discount en UI si aplican 2 veces, reseteamos precios desde catálogo:
    cart = cart.map((item) => {
      const p = catalog.find((x) => String(x.id) === String(item.id));
      const base = Number(p?.baseMXN || item.price || 0);
      const discounted = Math.round(base * (1 - promoApplied.value));
      return { ...item, price: discounted };
    });

    toast("Cupón aplicado ✅");
    saveCart();
  } else {
    toast("Cupón inválido");
  }
}
window.applyPromo = applyPromo;

/* =========================================================
   SHIPPING (Envia quote) — UI + Mini
   ========================================================= */
async function quoteShipping({ zip, country, qty }) {
  const res = await fetch(API.quote, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ zip, country, qty })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data?.ok) {
    const msg = data?.error || "No se pudo cotizar envío";
    throw new Error(msg);
  }
  return data.quote;
}

async function quoteShippingUI() {
  const zip = $("#shipZip")?.value?.trim();
  const country = $("#shipCountry")?.value || "MX";
  if (!zip) return toast("Ingresa CP");

  const qty = Math.max(1, cartCount() || 1);

  const out = $("#shipQuote");
  if (out) out.textContent = "Cotizando...";

  try {
    const q = await quoteShipping({ zip, country, qty });
    shippingQuote = q;

    if (out) out.textContent =
      `Envío ${String(q.carrier || "").toUpperCase()}: ${money(q.mxn)} (${q.eta || "ETA"})`;

    updateCartUI();
    toast("Envío cotizado ✅");
  } catch (e) {
    if (out) out.textContent = "No se pudo cotizar";
    toast(e.message || "Error cotizando envío");
  }
}
window.quoteShippingUI = quoteShippingUI;

async function quoteShippingMini() {
  const zip = $("#miniZip")?.value?.trim();
  const mode = $("#shippingMode")?.value || "pickup";
  if (mode === "pickup") {
    shippingQuote = null;
    $("#miniShipLabel").textContent = "Pickup seleccionado";
    updateCartUI();
    return;
  }
  if (!zip) return toast("CP requerido");

  const country = mode === "us" ? "US" : "MX";
  const qty = Math.max(1, cartCount() || 1);

  const label = $("#miniShipLabel");
  if (label) label.textContent = "Cotizando...";

  try {
    const q = await quoteShipping({ zip, country, qty });
    shippingQuote = q;
    if (label) label.textContent = `${String(q.carrier || "").toUpperCase()} ${money(q.mxn)} · ${q.eta || ""}`.trim();
    updateCartUI();
  } catch (e) {
    if (label) label.textContent = "Sin cotización";
    toast(e.message || "Error cotizando envío");
  }
}
window.quoteShippingMini = quoteShippingMini;

/* =========================================================
   CHECKOUT (Stripe session)
   ========================================================= */
async function checkout() {
  if (!cart.length) return toast("Carrito vacío");

  const shippingMode = $("#shippingMode")?.value || "pickup";
  const zip = $("#miniZip")?.value?.trim() || "";

  // Si el usuario eligió envío pero no cotizó (y tu backend lo exige),
  // el backend devolverá error claro. Aquí damos hint.
  if ((shippingMode === "mx" || shippingMode === "us") && !zip) {
    toast("Ingresa CP para envío");
    return;
  }

  const payload = {
    cart,
    shippingMode,
    zip,
    promoCode: promoApplied?.code || ""
  };

  const btn = $("#checkoutBtn");
  const prev = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Procesando...`;
  }

  try {
    const res = await fetch(API.checkout, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data?.url) {
      const msg = data?.error || "No se pudo iniciar el pago";
      throw new Error(msg);
    }

    // Redirige a Stripe Checkout
    window.location.href = data.url;
  } catch (e) {
    toast(e.message || "Error en checkout");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = prev || `<i class="fa-solid fa-credit-card"></i> PAGAR`;
    }
  }
}
window.checkout = checkout;

/* =========================================================
   SCORE AI (Gemini) — Chat UI
   ========================================================= */
function toggleAiAssistant() {
  const modal = $("#aiChatModal");
  if (!modal) return;
  modal.classList.toggle("show");
}
window.toggleAiAssistant = toggleAiAssistant;

async function sendAiMessage() {
  const input = $("#aiInput");
  const msg = input?.value?.trim();
  if (!msg) return;

  const body = $("#aiMessages");
  if (body) body.innerHTML += `<div style="margin-bottom:10px;"><b>Tú:</b> ${safeText(msg)}</div>`;
  if (input) input.value = "";

  try {
    const res = await fetch(API.chat, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg })
    });

    const data = await res.json().catch(() => ({}));

    const reply = data?.reply || "Estoy aquí. Dime qué necesitas (tallas, envío, producto).";
    if (body) body.innerHTML += `<div style="margin-bottom:12px;"><b>SCORE AI:</b> ${safeText(reply)}</div>`;
    if (body) body.scrollTop = body.scrollHeight;
  } catch {
    if (body) body.innerHTML += `<div style="margin-bottom:12px;"><b>SCORE AI:</b> No pude responder. Intenta de nuevo.</div>`;
  }
}
window.sendAiMessage = sendAiMessage;

/* =========================================================
   BINDINGS / EVENTS
   ========================================================= */
function bindCoreEvents() {
  // Botón carrito (header)
  const cartBtn = $("#cartBtn");
  if (cartBtn) cartBtn.addEventListener("click", openCart);

  // Backdrop ya trae onclick en HTML, pero lo reforzamos
  const backdrop = $("#backdrop");
  if (backdrop) backdrop.addEventListener("click", closeCart);

  // Modal AI: click fuera cierra (opcional)
  const aiModal = $("#aiChatModal");
  if (aiModal) {
    aiModal.addEventListener("click", (e) => {
      if (e.target === aiModal) toggleAiAssistant();
    });
  }

  // Cambiar modo shipping: si cambia a pickup, limpia quote
  const shippingMode = $("#shippingMode");
  if (shippingMode) {
    shippingMode.addEventListener("change", () => {
      const mode = shippingMode.value;
      if (mode === "pickup") {
        shippingQuote = null;
        const label = $("#miniShipLabel");
        if (label) label.textContent = "Pickup seleccionado";
        updateCartUI();
      }
    });
  }
}

/* =========================================================
   INIT
   ========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  loadCart();
  updateCartUI();
  bindCoreEvents();
  initFilters();

  // Si vienes de Stripe success
  const params = new URLSearchParams(window.location.search);
  if (params.get("status") === "success") {
    toast("Pago confirmado 🏁");
    cart = [];
    shippingQuote = null;
    promoApplied = null;
    saveCart();
  }

  // Carga catálogo (no modifica tu JSON)
  try {
    await loadCatalog();
  } catch (e) {
    console.error(e);
    toast("No se pudo cargar el catálogo");
  }

  // Intro (solo 1 vez)
  if (shouldShowIntro()) showIntro();
});