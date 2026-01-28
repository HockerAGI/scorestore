/* =========================================================
   SCORE STORE — MAIN LOGIC (2026_PROD_UNIFIED)
   - Compatible con index.html actual
   - Compatible con backend unificado:
     POST /api/quote  -> { ok:true, cost, label, source }
     POST /api/checkout -> { id, url }
   ========================================================= */

const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);
const fmtMXN = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    Number(n || 0)
  );

// ESTADO
const state = {
  cart: JSON.parse(localStorage.getItem("score_cart_v5") || "[]"),
  products: [],
  shipping: { mode: "pickup", quote: 0, label: "Pickup Tijuana (Gratis)" },
  promo: { code: "", applied: false },
  filter: "ALL",
};

// TEXTOS LEGALES (Tu contenido exacto)
const LEGAL_CONTENT = {
  privacy: {
    title: "Aviso de Privacidad",
    html: "<p>BAJATEX, S. de R.L. de C.V. es responsable de tus datos...</p>",
  },
  terms: {
    title: "Términos y Condiciones",
    html: "<p>Cambios en 30 días naturales. No aplica personalizados...</p>",
  },
  legal: {
    title: "Información Legal",
    html: "<p>Razón Social: BAJATEX. Domicilio: Palermo 6106, Tijuana...</p>",
  },
  contact: {
    title: "Contacto",
    html: "<p>WhatsApp: +52 664 236 8701. Email: ventas.unicotexti@gmail.com</p>",
  },
};

// AUDIO (móvil-friendly: no crea AudioContext cada vez)
let __audioCtx = null;
const getAudioCtx = () => {
  if (__audioCtx) return __audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  __audioCtx = new Ctx();
  return __audioCtx;
};

const playSound = (type) => {
  const ctx = getAudioCtx();
  if (!ctx) return;

  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(ctx.destination);

  const now = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, now);

  if (type === "pop") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, now);
    g.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  if (type === "success") {
    osc.type = "triangle";
    osc.frequency.setValueAtTime(450, now);
    osc.frequency.linearRampToValueAtTime(720, now + 0.18);
    g.gain.exponentialRampToValueAtTime(0.10, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc.start(now);
    osc.stop(now + 0.29);
  }
};

// UI HELPERS
const toast = (msg) => {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  playSound("pop");
  setTimeout(() => t.classList.remove("show"), 3000);
};

const digitsOnly = (s) => String(s || "").replace(/\D+/g, "");
const normalizeQty = (n) => {
  const q = Number(n || 0);
  if (!Number.isFinite(q)) return 1;
  return Math.max(1, Math.min(99, Math.round(q)));
};

const cartItemsForQuote = () =>
  (state.cart || []).map((i) => ({ qty: normalizeQty(i.qty || i.quantity || 1) }));

const modeToCountry = (mode) => (String(mode || "mx").toLowerCase() === "us" ? "US" : "MX");

// --------------------
// CATALOGO + FILTROS
// --------------------
async function loadCatalog() {
  try {
    const r = await fetch("/data/catalog.json", { cache: "no-store" });
    const data = await r.json();
    state.products = data.products || [];
    renderGrid(getFilteredProducts());
  } catch (e) {
    const grid = $("#productsGrid");
    if (grid) grid.innerHTML = "<p>Cargando...</p>";
  }
}

function getFilteredProducts() {
  if (!state.filter || state.filter === "ALL") return state.products;
  return (state.products || []).filter(
    (p) => String(p.sectionId || "").toUpperCase() === String(state.filter).toUpperCase()
  );
}

/* Reemplaza la función renderGrid en js/main.js con esta versión */
function renderGrid(list) {
  const grid = $("#productsGrid");
  if (!grid) return;

  grid.innerHTML = "";

  if (!list || list.length === 0) {
    grid.innerHTML =
      "<p style='grid-column:1/-1;text-align:center;padding:40px;opacity:0.6'>No hay productos disponibles.</p>";
    return;
  }

  list.forEach((p) => {
    const card = document.createElement("div");
    card.className = "card";
    // OPTIMIZACIÓN: width/height explícitos para CLS score
    card.innerHTML = `
      <div class="cardImg">
        <img src="${p.img}" loading="lazy" alt="${p.name}" width="300" height="300">
      </div>
      <div class="cardBody">
        <div class="cardTitle">${p.name}</div>
        <div class="cardPrice">${fmtMXN(p.baseMXN)}</div>
        <div class="cardControls">
          <label for="size-${p.id}" class="sr-only">Talla</label>
          <select id="size-${p.id}">
            ${(p.sizes || ["Unitalla"])
              .map((s) => `<option value="${s}">${s}</option>`)
              .join("")}
          </select>
          <button type="button" onclick="addToCart('${p.id}')" aria-label="Agregar ${p.name} al carrito">
            <i class="fa-solid fa-plus" aria-hidden="true"></i>
          </button>
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

// --------------------
// CART
// --------------------
window.addToCart = (id) => {
  const p = state.products.find((x) => x.id === id);
  if (!p) return toast("Producto no disponible");

  const sizeEl = $(`#size-${id}`);
  const size = sizeEl ? sizeEl.value : (p.sizes || ["Unitalla"])[0];

  const key = `${id}-${size}`;
  const ex = state.cart.find((i) => i.key === key);
  if (ex) ex.qty++;
  else state.cart.push({ key, id: p.id, name: p.name, price: p.baseMXN, img: p.img, size, qty: 1 });

  saveCart();
  openCart();
  toast("Agregado al equipo");
};

function saveCart() {
  localStorage.setItem("score_cart_v5", JSON.stringify(state.cart));

  const cnt = state.cart.reduce((a, b) => a + normalizeQty(b.qty), 0);
  const cartCountEl = $("#cartCount");
  if (cartCountEl) cartCountEl.textContent = cnt;

  const box = $("#cartItems");
  if (!box) return;

  box.innerHTML = "";
  let sub = 0;

  state.cart.forEach((i, idx) => {
    sub += Number(i.price || 0) * normalizeQty(i.qty);
    box.innerHTML += `
      <div class="cartRow">
        <div class="cartThumb"><img src="${i.img}" alt=""></div>
        <div class="cartInfo">
          <div class="name">${i.name}</div>
          <div class="price">${i.size} | ${fmtMXN(i.price)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:5px;">
          <button class="qtyBtn" type="button" onclick="modQty(${idx},-1)">-</button>
          <span>${normalizeQty(i.qty)}</span>
          <button class="qtyBtn" type="button" onclick="modQty(${idx},1)">+</button>
        </div>
      </div>`;
  });

  const ship = Number(state.shipping.quote || 0);

  const subEl = $("#cartSubtotal");
  const shipEl = $("#cartShipping");
  const totalEl = $("#cartTotal");
  const miniLabel = $("#miniShipLabel");

  if (subEl) subEl.textContent = fmtMXN(sub);

  // Texto shipping: pickup = Gratis, si no pickup y no cotizado = Pendiente
  if (shipEl) {
    if (state.shipping.mode === "pickup") shipEl.textContent = "Gratis";
    else if (ship > 0) shipEl.textContent = fmtMXN(ship);
    else shipEl.textContent = "Pendiente";
  }

  if (totalEl) totalEl.textContent = fmtMXN(sub + ship);
  if (miniLabel) miniLabel.textContent = state.shipping.label || "";
}

window.modQty = (i, d) => {
  if (!state.cart[i]) return;
  state.cart[i].qty += d;
  if (state.cart[i].qty <= 0) state.cart.splice(i, 1);

  // Al cambiar qty, invalidamos shipping si no pickup (para evitar total “fake”)
  if (state.shipping.mode !== "pickup") {
    state.shipping.quote = 0;
    state.shipping.label = "Cotiza tu envío";
  }

  saveCart();
};

window.openCart = () => {
  $("#cartDrawer")?.classList.add("open");
  $("#backdrop")?.classList.add("show");
  saveCart();
};

window.closeCart = () => {
  $("#cartDrawer")?.classList.remove("open");
  $("#backdrop")?.classList.remove("show");
};

// --------------------
// SHIPPING: Mini (carrito) + UI grande (sección envíos)
// --------------------
function setMiniZipVisibility(mode) {
  const miniZip = $("#miniZip");
  if (!miniZip) return;

  if (mode === "pickup") {
    miniZip.style.display = "none";
  } else {
    miniZip.style.display = "block";
    miniZip.placeholder = mode === "us" ? "ZIP (USA)" : "Código Postal (MX)";
  }
}

// COTIZADOR (Fix para Carrito Glass)
const shippingModeEl = $("#shippingMode");
if (shippingModeEl) {
  shippingModeEl.addEventListener("change", (e) => {
    const m = String(e.target.value || "pickup").toLowerCase();
    setMiniZipVisibility(m);

    if (m === "pickup") state.shipping = { mode: "pickup", quote: 0, label: "Pickup Tijuana (Gratis)" };
    else state.shipping = { mode: m, quote: 0, label: "Cotiza tu envío" };

    saveCart();
  });
}

// ✅ NUEVO: Cotizador mini compatible con backend real
window.quoteShippingMini = async () => {
  const zipRaw = $("#miniZip")?.value || "";
  const zip = digitsOnly(zipRaw);
  const mode = String($("#shippingMode")?.value || "pickup").toLowerCase();

  if (mode !== "pickup" && (!zip || zip.length < 4)) return toast("Ingresa tu CP/ZIP");

  const miniLabel = $("#miniShipLabel");
  if (miniLabel) miniLabel.textContent = "Cotizando...";

  try {
    if (mode === "pickup") {
      state.shipping = { mode: "pickup", quote: 0, label: "Pickup Tijuana (Gratis)" };
      saveCart();
      return;
    }

    const country = modeToCountry(mode);
    const res = await fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zip, country, items: cartItemsForQuote() }),
    });

    const d = await res.json();

    if (!d.ok) throw new Error(d.error || "No se pudo cotizar");

    state.shipping = {
      mode,
      quote: Number(d.cost || 0),
      label: d.label || (country === "US" ? "Envío USA" : "Envío México"),
    };

    saveCart();
    toast("Envío actualizado");
    playSound("success");
  } catch (e) {
    console.error(e);
    toast("Error cotizando");
    state.shipping.quote = 0;
    state.shipping.label = "Cotiza tu envío";
    saveCart();
  }
};

// ✅ NUEVO: Cotizador grande del bloque #envios (tu index lo llama)
window.quoteShippingUI = async () => {
  const country = String($("#shipCountry")?.value || "MX").toUpperCase();
  const zip = digitsOnly($("#shipZip")?.value || "");
  const out = $("#shipQuote");

  if (!zip || zip.length < 4) {
    if (out) out.textContent = "Ingresa un código postal válido.";
    return;
  }

  if (out) out.textContent = "Cotizando...";

  try {
    const res = await fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zip, country, items: cartItemsForQuote() }),
    });
    const d = await res.json();

    if (!d.ok) throw new Error(d.error || "No se pudo cotizar");

    if (out) out.innerHTML = `<b>${d.label || "Envío"}</b> · ${fmtMXN(Number(d.cost || 0))}`;
    toast("Cotización lista");
    playSound("success");
  } catch (e) {
    console.error(e);
    if (out) out.textContent = "No se pudo cotizar. Intenta de nuevo.";
    toast("Error cotizando");
  }
};

// --------------------
// PROMO (no rompe: solo guarda y manda a Stripe en metadata)
// --------------------
window.applyPromo = () => {
  const code = String($("#promoCode")?.value || "").trim().toUpperCase();
  if (!code) return toast("Ingresa un cupón");

  state.promo = { code, applied: true };
  toast(`Cupón "${code}" listo para el pago`);
};

// --------------------
// CHECKOUT
// --------------------
window.checkout = async () => {
  if (!state.cart.length) return toast("Carrito vacío");

  const mode = String(state.shipping.mode || "pickup").toLowerCase();
  const zip = digitsOnly($("#miniZip")?.value || "");

  // Si NO pickup, requerimos zip y quote válido
  if (mode !== "pickup") {
    if (!zip || zip.length < 4) return toast("Ingresa tu CP/ZIP");
    if (!state.shipping.quote || Number(state.shipping.quote) <= 0) return toast("Cotiza el envío primero");
  }

  const btn = $("#checkoutBtn");
  if (btn) btn.innerHTML = "PROCESANDO...";

  try {
    // Tu backend create_checkout acepta payload viejo + promoCode + shippingData
    const payload = {
      cart: state.cart,
      shippingMode: mode,
      shippingData: { postal_code: zip },
      promoCode: state.promo?.code || "",
    };

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const d = await res.json();

    // ✅ backend responde {id, url} (no d.ok)
    if (d && d.url) {
      window.location.href = d.url;
      return;
    }

    throw new Error(d?.error || "Checkout error");
  } catch (e) {
    console.error(e);
    toast("Error checkout");
    if (btn) btn.innerHTML = "PAGAR SEGURO";
  }
};

// --------------------
// LEGAL MODAL
// --------------------
$$(".jsLegalLink").forEach((b) =>
  b.addEventListener("click", () => {
    const type = b.dataset.legal;
    if (LEGAL_CONTENT[type]) {
      $("#legalTitle").textContent = LEGAL_CONTENT[type].title;
      $("#legalBody").innerHTML = LEGAL_CONTENT[type].html;
      $("#legalModal")?.classList.add("show");
    }
  })
);

$("#legalClose")?.addEventListener("click", () => $("#legalModal")?.classList.remove("show"));
$("#legalBackdrop")?.addEventListener("click", () => $("#legalModal")?.classList.remove("show"));

// --------------------
// MARKETING NOTIFICATIONS (Cambio 8) - menos saturado
// --------------------
const MOCKS = [
  "Gorra vendida en CDMX",
  "Hoodie enviada a Tijuana",
  "Camiseta vendida en La Paz",
  "Sudadera rumbo a Ensenada",
  "Merch SCORE a Monterrey",
];

setInterval(() => {
  if (document.hidden) return;
  if (Math.random() > 0.75) toast("🛍️ " + MOCKS[Math.floor(Math.random() * MOCKS.length)]);
}, 28000);

// --------------------
// AI CHAT
// --------------------
window.toggleAiAssistant = () => $("#aiChatModal")?.classList.toggle("show");

window.sendAiMessage = async () => {
  const i = $("#aiInput");
  const txt = String(i?.value || "").trim();
  if (!txt) return;

  const box = $("#aiMessages");
  if (box) box.innerHTML += `<div class="ai-msg ai-me">${escapeHtml(txt)}</div>`;
  if (i) i.value = "";

  try {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: txt }),
    });
    const d = await r.json();
    if (box) box.innerHTML += `<div class="ai-msg ai-bot">${escapeHtml(d.reply || "Error")}</div>`;
  } catch (e) {
    if (box) box.innerHTML += `<div class="ai-msg ai-bot">Error de conexión.</div>`;
  }
};

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// --------------------
// FILTROS (chips) - tu index ya los trae
// --------------------
function bindFilters() {
  const chips = $$(".chip");
  if (!chips.length) return;

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");

      state.filter = String(chip.dataset.filter || "ALL").toUpperCase();
      renderGrid(getFilteredProducts());
    });
  });
}

// --------------------
// BOOT
// --------------------
document.addEventListener("DOMContentLoaded", () => {
  // activar audio con primer toque (móvil)
  document.addEventListener(
    "pointerdown",
    () => {
      const ctx = getAudioCtx();
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    },
    { once: true }
  );

  // Catalogo + filtros
  loadCatalog();
  bindFilters();

  // Intro
  setTimeout(() => {
    const intro = $("#intro");
    if (intro) intro.style.display = "none";
  }, 2500);

  $("#introSkip")?.addEventListener("click", () => {
    const intro = $("#intro");
    if (intro) intro.style.display = "none";
  });

  // Init shipping UI state
  const m = String($("#shippingMode")?.value || "pickup").toLowerCase();
  setMiniZipVisibility(m);

  // pintar carrito
  saveCart();

  // status de Stripe (success/cancel)
  const params = new URLSearchParams(location.search);
  const status = params.get("status");
  if (status === "success") {
    toast("Pago confirmado 🏁");
    state.cart = [];
    localStorage.setItem("score_cart_v5", "[]");
    saveCart();
    history.replaceState({}, document.title, "/");
  } else if (status === "cancel") {
    toast("Pago cancelado");
    history.replaceState({}, document.title, "/");
  }
});