/* =========================================================
   SCORE STORE — MAIN LOGIC (2026_PROD_UNIFIED · ALIGNED)
   - Catálogo /data/catalog.json
   - Carrusel tipo FB (scroll-snap + dots)
   - Carrito + cotización /api/quote
   - Checkout /api/checkout
   - Alineado a index FINAL_AUDIT (drawerClose, ai modal, legal modal)
   ========================================================= */

const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);

const fmtMXN = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    Number(n || 0)
  );

// --------------------
// ESTADO
// --------------------
const state = {
  cart: JSON.parse(localStorage.getItem("score_cart_v5") || "[]"),
  products: [],
  shipping: { mode: "pickup", quote: 0, label: "Pickup Tijuana (Gratis)" },
  filter: "ALL",
  __quoteTimer: null,
  __quoteInFlight: false,
};

// --------------------
// AUDIO (simple, safe)
// --------------------
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
  if (!ctx || ctx.state === "closed") return;
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
  } else if (type === "success") {
    osc.type = "triangle";
    osc.frequency.setValueAtTime(450, now);
    osc.frequency.linearRampToValueAtTime(720, now + 0.18);
    g.gain.exponentialRampToValueAtTime(0.10, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc.start(now);
    osc.stop(now + 0.29);
  }
};

// --------------------
// UI helpers
// --------------------
const toast = (msg) => {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  playSound("pop");
  setTimeout(() => t.classList.remove("show"), 2800);
};

const digitsOnly = (s) => String(s || "").replace(/\D+/g, "");
const normalizeQty = (n) => Math.max(1, Math.min(99, Math.round(Number(n) || 1)));
const modeToCountry = (mode) => (String(mode || "mx").toLowerCase() === "us" ? "US" : "MX");
const cartItemsForQuote = () => (state.cart || []).map((i) => ({ qty: normalizeQty(i.qty) }));

function safeId(str) {
  return String(str || "").replace(/[^a-zA-Z0-9_-]/g, "");
}

async function postJSON(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

// --------------------
// INTRO (si existe)
// --------------------
function initIntro() {
  const intro = $("#intro");
  const skip = $("#introSkip");
  if (!intro) return;

  const hide = () => {
    intro.style.opacity = "0";
    intro.style.pointerEvents = "none";
    setTimeout(() => intro.remove(), 400);
  };

  skip?.addEventListener("click", hide);
  // auto hide (rápido)
  setTimeout(hide, 1200);
}

// --------------------
// CATALOGO + CAROUSEL
// --------------------
async function loadCatalog() {
  try {
    const r = await fetch("/data/catalog.json", { cache: "no-store" });
    if (!r.ok) throw new Error("CATALOG_HTTP_" + r.status);
    const data = await r.json();
    state.products = data.products || [];
    renderGrid(getFilteredProducts());
  } catch (e) {
    const g = $("#productsGrid");
    if (g) {
      g.innerHTML =
        "<p style='grid-column:1/-1;text-align:center;opacity:0.6'>Error cargando catálogo.</p>";
    }
    console.error(e);
  }
}

function getFilteredProducts() {
  if (!state.filter || state.filter === "ALL") return state.products;
  return (state.products || []).filter(
    (p) => String(p.sectionId || "").toUpperCase() === String(state.filter).toUpperCase()
  );
}

function renderGrid(list) {
  const grid = $("#productsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  if (!list || list.length === 0) {
    grid.innerHTML =
      "<p style='grid-column:1/-1;text-align:center;opacity:0.6'>No hay productos disponibles.</p>";
    return;
  }

  list.forEach((p) => {
    const pid = safeId(p.id);
    const card = document.createElement("div");
    card.className = "card";

    const images = (p.images && p.images.length > 0) ? p.images : [p.img].filter(Boolean);

    let mediaHtml = "";
    if (images.length > 1) {
      const slides = images
        .map(
          (src) =>
            `<div class="carousel-item"><img src="${src}" loading="lazy" alt="${p.name}" width="420" height="420"></div>`
        )
        .join("");

      const dots = images
        .map((_, i) => `<div class="dot ${i === 0 ? "active" : ""}"></div>`)
        .join("");

      mediaHtml = `
        <div class="cardMedia" id="media-${pid}">
          <div class="carousel" data-pid="${pid}">
            ${slides}
          </div>
          <div class="carousel-dots" id="dots-${pid}">
            ${dots}
          </div>
        </div>`;
    } else {
      mediaHtml = `
        <div class="cardMedia">
          <img src="${images[0] || "/assets/placeholder.webp"}" loading="lazy" alt="${p.name}" width="420" height="420" style="object-fit:cover;width:100%;height:100%">
        </div>`;
    }

    card.innerHTML = `
      ${mediaHtml}
      <div class="cardBody">
        <div>
          <div class="cardTitle">${p.name}</div>
          <div class="cardPrice">${fmtMXN(p.baseMXN)}</div>
        </div>
        <div class="cardControls">
          <label for="size-${pid}" class="sr-only">Talla</label>
          <select id="size-${pid}">
            ${(p.sizes || ["Unitalla"]).map((s) => `<option value="${s}">${s}</option>`).join("")}
          </select>
          <button type="button" data-add="${pid}" aria-label="Agregar">
            <i class="fa-solid fa-plus" aria-hidden="true"></i>
          </button>
        </div>
      </div>`;

    grid.appendChild(card);

    // add
    card.querySelector(`[data-add="${pid}"]`)?.addEventListener("click", () => addToCart(p.id));

    // carousel dots
    const car = card.querySelector(".carousel");
    if (car) {
      car.addEventListener(
        "scroll",
        () => updateDots(car, pid),
        { passive: true }
      );
    }
  });
}

function updateDots(carousel, pid) {
  const width = carousel.getBoundingClientRect().width || carousel.clientWidth || 1;
  const idx = Math.round((carousel.scrollLeft || 0) / width);
  const dotsContainer = document.getElementById(`dots-${pid}`);
  if (!dotsContainer) return;
  const dots = dotsContainer.querySelectorAll(".dot");
  dots.forEach((d, i) => (i === idx ? d.classList.add("active") : d.classList.remove("active")));
}

// --------------------
// CART
// --------------------
function addToCart(id) {
  const p = state.products.find((x) => x.id === id);
  if (!p) return toast("Producto no disponible");

  const pid = safeId(id);
  const sizeEl = $(`#size-${pid}`);
  const size = sizeEl ? sizeEl.value : "Unitalla";
  const key = `${id}-${size}`;

  const ex = state.cart.find((i) => i.key === key);
  if (ex) ex.qty = normalizeQty(ex.qty + 1);
  else state.cart.push({ key, id: p.id, name: p.name, price: p.baseMXN, img: p.img, size, qty: 1 });

  openCart();
  toast("Agregado al carrito");
  requestMiniQuote(); // si ya hay modo envío y CP, re-cotiza
}

function saveCart() {
  localStorage.setItem("score_cart_v5", JSON.stringify(state.cart));

  const cnt = state.cart.reduce((a, b) => a + normalizeQty(b.qty), 0);
  const cartCount = $("#cartCount");
  if (cartCount) cartCount.textContent = cnt;

  const box = $("#cartItems");
  if (!box) return;

  box.innerHTML = "";

  let sub = 0;
  state.cart.forEach((i, idx) => {
    sub += Number(i.price) * normalizeQty(i.qty);
    box.innerHTML += `
      <div class="cartRow">
        <div class="cartThumb"><img src="${i.img}" alt=""></div>
        <div class="cartInfo">
          <div class="name">${i.name}</div>
          <div class="price">${i.size} | ${fmtMXN(i.price)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <button class="qtyBtn" type="button" aria-label="Menos" data-mod="${idx}" data-d="-1">-</button>
          <span style="font-weight:900;font-size:13px">${normalizeQty(i.qty)}</span>
          <button class="qtyBtn" type="button" aria-label="Más" data-mod="${idx}" data-d="1">+</button>
        </div>
      </div>`;
  });

  // bind qty buttons
  box.querySelectorAll("[data-mod]").forEach((b) => {
    b.addEventListener("click", () => {
      const i = Number(b.getAttribute("data-mod"));
      const d = Number(b.getAttribute("data-d"));
      modQty(i, d);
    });
  });

  const ship = Number(state.shipping.quote || 0);
  const subEl = $("#cartSubtotal");
  const shipEl = $("#cartShipping");
  const totEl = $("#cartTotal");
  const miniLabel = $("#miniShipLabel");

  if (subEl) subEl.textContent = fmtMXN(sub);

  if (shipEl) {
    if (state.shipping.mode === "pickup") shipEl.textContent = "Gratis";
    else if (ship > 0) shipEl.textContent = fmtMXN(ship);
    else shipEl.textContent = "Pendiente";
  }

  if (totEl) totEl.textContent = fmtMXN(sub + ship);
  if (miniLabel) miniLabel.textContent = state.shipping.label || "";
}

function modQty(i, d) {
  if (!state.cart[i]) return;

  const next = Number(state.cart[i].qty) + Number(d);
  if (next <= 0) state.cart.splice(i, 1);
  else state.cart[i].qty = normalizeQty(next);

  // si no es pickup, obligamos a recotizar
  if (state.shipping.mode !== "pickup") {
    state.shipping.quote = 0;
    state.shipping.label = "Cotiza de nuevo";
  }

  saveCart();
  requestMiniQuote();
}

function openCart() {
  $("#cartDrawer")?.classList.add("open");
  $("#backdrop")?.classList.add("show");
  saveCart();
}
function closeCart() {
  $("#cartDrawer")?.classList.remove("open");
  $("#backdrop")?.classList.remove("show");
}

window.openCart = openCart;
window.closeCart = closeCart;

// --------------------
// SHIPPING (MINI)
// --------------------
function requestMiniQuote() {
  clearTimeout(state.__quoteTimer);
  state.__quoteTimer = setTimeout(() => {
    // auto-cotiza si aplica
    const mode = $("#shippingMode")?.value || "pickup";
    const zip = digitsOnly($("#miniZip")?.value || "");
    if (mode === "pickup") return;
    if (zip.length < 4) return;
    quoteShippingMini().catch(() => {});
  }, 350);
}

$("#shippingMode")?.addEventListener("change", (e) => {
  const m = e.target.value;
  const miniZip = $("#miniZip");

  if (m === "pickup") {
    if (miniZip) miniZip.style.display = "none";
    state.shipping = { mode: "pickup", quote: 0, label: "Pickup Tijuana (Gratis)" };
  } else {
    if (miniZip) {
      miniZip.style.display = "block";
      miniZip.placeholder = m === "us" ? "ZIP Code (USA)" : "Código Postal (MX)";
    }
    state.shipping = { mode: m, quote: 0, label: "Ingresa CP y cotiza" };
  }

  saveCart();
  requestMiniQuote();
});

$("#miniZip")?.addEventListener("input", requestMiniQuote);

// Cotizador MINI (Carrito)
async function quoteShippingMini() {
  if (state.__quoteInFlight) return;

  const zipRaw = $("#miniZip")?.value || "";
  const zip = digitsOnly(zipRaw);
  const mode = $("#shippingMode")?.value || "pickup";

  if (mode === "pickup") return;
  if (zip.length < 4) return toast("Ingresa un CP válido");

  state.__quoteInFlight = true;

  const miniLabel = $("#miniShipLabel");
  if (miniLabel) miniLabel.textContent = "Cotizando...";

  try {
    const { data } = await postJSON("/api/quote", {
      zip,
      country: modeToCountry(mode),
      items: cartItemsForQuote().length ? cartItemsForQuote() : [{ qty: 1 }],
    });

    if (!data?.ok) throw new Error(data?.error || "QUOTE_FAILED");

    state.shipping = {
      mode,
      quote: Number(data.cost || 0),
      label: data.label || "Envío actualizado",
    };

    saveCart();
    toast("Envío actualizado");
    playSound("success");
  } catch (e) {
    console.error(e);
    state.shipping.quote = 0;
    state.shipping.label = "Error. Intenta otro CP.";
    saveCart();
    toast("No se pudo cotizar");
  } finally {
    state.__quoteInFlight = false;
  }
}

window.quoteShippingMini = quoteShippingMini;

// --------------------
// SHIPPING (LANDING /envios)
// --------------------
window.quoteShippingUI = async () => {
  const country = ($("#shipCountry")?.value || "MX").toUpperCase();
  const zip = digitsOnly($("#shipZip")?.value || "");
  const out = $("#shipQuote");

  if (zip.length < 4) {
    if (out) out.textContent = "Ingresa un código postal válido.";
    return;
  }
  if (out) out.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Cotizando...';

  try {
    const items = cartItemsForQuote().length ? cartItemsForQuote() : [{ qty: 1 }];
    const { data } = await postJSON("/api/quote", { zip, country, items });

    if (!data?.ok) throw new Error(data?.error || "QUOTE_FAILED");

    if (out) out.innerHTML = `<b>${data.label}</b> · ${fmtMXN(data.cost)}`;
    playSound("success");
  } catch (e) {
    console.error(e);
    if (out) out.textContent = "No se encontró tarifa. Intenta otro CP.";
  }
};

// --------------------
// CHECKOUT
// --------------------
window.checkout = async () => {
  if (!state.cart.length) return toast("Carrito vacío");

  const mode = state.shipping.mode;
  const zip = digitsOnly($("#miniZip")?.value || "");

  if (mode !== "pickup") {
    if (!zip || zip.length < 4) return toast("Falta código postal");
    if (!state.shipping.quote) return toast("Cotiza el envío primero");
  }

  const btn = $("#checkoutBtn");
  if (btn) btn.textContent = "PROCESANDO...";

  try {
    const { data } = await postJSON("/api/checkout", {
      cart: state.cart,
      shippingMode: mode,
      shippingData: { postal_code: zip },
      promoCode: "", // no existe promo input en tu index actual
    });

    if (data?.url) {
      window.location.href = data.url;
      return; // ✅ FIX CRÍTICO: no seguir ejecutando
    }

    throw new Error(data?.error || "CHECKOUT_FAILED");
  } catch (e) {
    console.error(e);
    toast("Error iniciando pago");
    if (btn) btn.textContent = "PAGAR SEGURO";
  }
};

// --------------------
// LEGAL (stubs safe si aún no lo pegaste)
// --------------------
(function initLegalSafe() {
  const modal = $("#legalModal");
  const backdrop = $("#legalBackdrop");
  const closeBtn = $("#legalClose");
  const title = $("#legalTitle");
  const body = $("#legalBody");

  if (!modal || !backdrop || !closeBtn || !title || !body) return;

  const show = (t, html) => {
    title.textContent = t || "Info";
    body.innerHTML = html || "<p>Contenido no disponible.</p>";
    modal.classList.add("show");
  };
  const hide = () => modal.classList.remove("show");

  closeBtn.addEventListener("click", hide);
  backdrop.addEventListener("click", hide);

  // Si ya existe window.LEGAL_CONTENT, úsalo
  $$(".jsLegalLink").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.legal;
      const lib = window.LEGAL_CONTENT || {};
      const item = lib[key] || null;
      show(item?.title || "Info", item?.html || "<p>Próximamente.</p>");
    });
  });
})();

// --------------------
// AI (stubs safe)
// --------------------
window.toggleAiAssistant = () => {
  const m = $("#aiChatModal");
  if (!m) return;
  m.classList.toggle("show");
};

window.sendAiMessage = async () => {
  const input = $("#aiInput");
  const box = $("#aiMessages");
  if (!input || !box) return;

  const text = String(input.value || "").trim();
  if (!text) return;

  const me = document.createElement("div");
  me.className = "ai-msg ai-me";
  me.textContent = text;
  box.appendChild(me);
  box.scrollTop = box.scrollHeight;
  input.value = "";

  // si tienes /api/chat, lo usamos. si no, respuesta placeholder
  try {
    const { data } = await postJSON("/api/chat", { message: text });
    const replyText = data?.reply || data?.message || "Listo. ¿Qué necesitas ajustar?";
    const bot = document.createElement("div");
    bot.className = "ai-msg ai-bot";
    bot.textContent = replyText;
    box.appendChild(bot);
    box.scrollTop = box.scrollHeight;
  } catch {
    const bot = document.createElement("div");
    bot.className = "ai-msg ai-bot";
    bot.textContent = "Estoy en modo offline. Conecta /api/chat para respuestas en vivo.";
    box.appendChild(bot);
    box.scrollTop = box.scrollHeight;
  }
};

// --------------------
// BOOT
// --------------------
document.addEventListener("DOMContentLoaded", () => {
  initIntro();
  loadCatalog();

  // filtros
  $$(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $$(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.filter = chip.dataset.filter;
      renderGrid(getFilteredProducts());
    });
  });

  // init shipping visibility (mini)
  const m = $("#shippingMode")?.value || "pickup";
  const mz = $("#miniZip");
  if (mz) mz.style.display = m === "pickup" ? "none" : "block";

  // drawer close (index usa .drawerClose)
  $(".drawerClose")?.addEventListener("click", closeCart);
  $("#backdrop")?.addEventListener("click", closeCart);

  saveCart();

  // status stripe
  const params = new URLSearchParams(location.search);
  if (params.get("status") === "success") {
    toast("Pago confirmado 🏁");
    state.cart = [];
    localStorage.removeItem("score_cart_v5");
    saveCart();
    history.replaceState({}, document.title, "/");
  } else if (params.get("status") === "cancel") {
    toast("Pago cancelado");
    history.replaceState({}, document.title, "/");
  }
});