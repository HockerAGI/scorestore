/* =========================================================
   SCORE STORE — MAIN LOGIC (2026_PROD_UNIFIED)
   - Catálogo desde /data/catalog.json
   - Carrusel tipo Facebook por producto (scroll-snap + dots)
   - Carrito + cotización real /api/quote (Netlify Function)
   - Checkout /api/checkout (Stripe Session)
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

const toast = (msg) => {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  playSound("pop");
  setTimeout(() => t.classList.remove("show"), 3000);
};

const digitsOnly = (s) => String(s || "").replace(/\D+/g, "");
const normalizeQty = (n) => Math.max(1, Math.min(99, Math.round(Number(n) || 1)));
const modeToCountry = (mode) => (String(mode || "mx").toLowerCase() === "us" ? "US" : "MX");
const cartItemsForQuote = () => (state.cart || []).map((i) => ({ qty: normalizeQty(i.qty) }));

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
    if (g) g.innerHTML = "<p style='grid-column:1/-1;text-align:center;opacity:0.6'>Error cargando catálogo.</p>";
    console.error(e);
  }
}

function getFilteredProducts() {
  if (!state.filter || state.filter === "ALL") return state.products;
  return (state.products || []).filter(
    (p) => String(p.sectionId || "").toUpperCase() === String(state.filter).toUpperCase()
  );
}

function safeId(str) {
  return String(str || "").replace(/[^a-zA-Z0-9_-]/g, "");
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

    // imágenes: usa p.images si existe; si no, p.img
    const images = (p.images && p.images.length > 0) ? p.images : [p.img];

    let mediaHtml = "";
    if (images.length > 1) {
      const slides = images
        .map(
          (src) =>
            `<div class="carousel-item"><img src="${src}" loading="lazy" alt="${p.name}" width="420" height="420"></div>`
        )
        .join("");

      const dots = images
        .map(
          (_, i) => `<div class="dot ${i === 0 ? "active" : ""}" data-idx="${i}"></div>`
        )
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
          <img src="${images[0]}" loading="lazy" alt="${p.name}" width="420" height="420" style="object-fit:cover;width:100%;height:100%">
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
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>
      </div>`;

    grid.appendChild(card);

    // Bind button
    const btn = card.querySelector(`[data-add="${pid}"]`);
    if (btn) btn.addEventListener("click", () => addToCart(p.id));

    // Bind carousel dots update (scroll)
    const car = card.querySelector(".carousel");
    if (car) {
      car.addEventListener("scroll", () => updateDots(car, pid), { passive: true });
    }
  });
}

// Actualiza dots por scroll
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
  state.cart[i].qty = normalizeQty(state.cart[i].qty + d);
  if (state.cart[i].qty <= 0) state.cart.splice(i, 1);

  // si no es pickup, obligamos a recotizar
  if (state.shipping.mode !== "pickup") {
    state.shipping.quote = 0;
    state.shipping.label = "Cotiza de nuevo";
  }
  saveCart();
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
// SHIPPING
// --------------------
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
});

async function postJSON(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Cotizador MINI (Carrito)
window.quoteShippingMini = async () => {
  const zipRaw = $("#miniZip")?.value || "";
  const zip = digitsOnly(zipRaw);
  const mode = $("#shippingMode")?.value || "pickup";

  if (mode === "pickup") return;
  if (zip.length < 4) return toast("Ingresa un CP válido");

  const miniLabel = $("#miniShipLabel");
  if (miniLabel) miniLabel.textContent = "Cotizando...";

  try {
    const { data } = await postJSON("/api/quote", {
      zip,
      country: modeToCountry(mode),
      items: cartItemsForQuote(),
    });

    if (!data?.ok) throw new Error(data?.error || "QUOTE_FAILED");

    state.shipping = { mode, quote: Number(data.cost || 0), label: data.label || "Envío actualizado" };
    saveCart();
    toast("Envío actualizado");
    playSound("success");
  } catch (e) {
    console.error(e);
    toast("No se pudo cotizar");
    state.shipping.quote = 0;
    state.shipping.label = "Error. Intenta otro CP.";
    saveCart();
  }
};

// Cotizador GRANDE (Landing)
window.quoteShippingUI = async () => {
  const country = $("#shipCountry")?.value || "MX";
  const zip = digitsOnly($("#shipZip")?.value || "");
  const out = $("#shipQuote");

  if (zip.length < 4) {
    if (out) out.textContent = "Ingresa un código postal válido.";
    return;
  }
  if (out) out.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cotizando...';

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
  const zip = digitsOnly($("#miniZip")?.value);

  if (mode !== "pickup") {
    if (!zip || zip.length < 4) return toast("Falta código postal");
    if (!state.shipping.quote) return toast("Cotiza el envío primero");
  }

  const btn = $("#checkoutBtn");
  if (btn) btn.innerHTML = "PROCESANDO...";

  try {
    const { data } = await postJSON("/api/checkout", {
      cart: state.cart,
      shippingMode: mode,
      shippingData: { postal_code: zip },
      promoCode: $("#promoCode")?.value || "",
    });

    if (data?.url) window.location.href = data.url;
    throw new Error(data?.error || "CHECKOUT_FAILED");
  } catch (e) {
    console.error(e);
    toast("Error iniciando pago");
    if (btn) btn.innerHTML = "PAGAR SEGURO";
  }
};

// --------------------
// BOOT
// --------------------
document.addEventListener("DOMContentLoaded", () => {
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

  // init shipping visibility
  const m = $("#shippingMode")?.value || "pickup";
  const mz = $("#miniZip");
  if (mz) mz.style.display = m === "pickup" ? "none" : "block";

  // cart open/close
  $("#cartBtn")?.addEventListener("click", openCart);
  $("#backdrop")?.addEventListener("click", closeCart);
  $("#cartClose")?.addEventListener("click", closeCart);

  saveCart();

  // status stripe
  const params = new URLSearchParams(location.search);
  if (params.get("status") === "success") {
    toast("Pago confirmado 🏁");
    state.cart = [];
    localStorage.removeItem("score_cart_v5");
    saveCart();
    history.replaceState({}, document.title, "/");
  }
});