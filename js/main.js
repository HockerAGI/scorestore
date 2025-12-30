/**
 * SCORE STORE - main.js (v23 PROD)
 * - Alineado a catalog.json corregido
 * - Soporte: sku, status, tags
 * - sectionId consistente (SF250)
 * - UI badges + subsecciones legibles
 * - Checkout y Stripe SIN TOCAR
 */

/* =========================
   CONFIG
========================= */

const STRIPE_PK =
  "pk_live_51Se6fsGUCnsKfgrBdpVBcTbXG99reZVkx8cpzMlJxr0EtUfuJAq0Qe3igAiQYmKhMn0HewZI5SGRcnKqAdTigpqB00fVsfpMYh";

const USD_RATE_FALLBACK = 17.5;

const LS_CART = "score_cart_v1";
const LS_PROMO = "score_promo_v1";

/* =========================
   LABEL MAPS
========================= */

const SUBSECTION_LABELS = {
  COLECCION_2025: "Colección 2025",
  COLECCION_BAJA_500: "Colección Baja 500",
  COLECCION_BAJA_400: "Colección Baja 400",
  COLECCION_SF250: "Colección San Felipe",
  ACCESORIOS: "Accesorios",
  PITS: "Equipo de Pits",
};

const STATUS_LABEL = {
  available: "Disponible",
  low_stock: "Últimas piezas",
  sold_out: "Agotado",
  pre_order: "Preventa",
};

/* =========================
   STATE
========================= */

let catalog = null;
let promos = null;

let cart = safeJson(localStorage.getItem(LS_CART), []);
let promoState = safeJson(localStorage.getItem(LS_PROMO), null);
let ship = { mode: "pickup", mxn: 0, label: "Pickup" };

/* =========================
   HELPERS
========================= */

const $ = (id) => document.getElementById(id);

const moneyMXN = (n) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(Number(n || 0));

const moneyUSD = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(n || 0));

function safeJson(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2400);
}

function debounce(fn, ms = 400) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

async function fetchJSON(url, { timeout = 8000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error("Bad response");
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/* =========================
   CART MATH
========================= */

function cartCount() {
  return cart.reduce((a, b) => a + Number(b.qty || 0), 0);
}

function subtotal() {
  return cart.reduce(
    (a, b) => a + Number(b.price || 0) * Number(b.qty || 0),
    0
  );
}

function getFx() {
  return Number(catalog?.site?.fx_mxn_per_usd || USD_RATE_FALLBACK);
}

function promoDiscountAmount(sub) {
  if (!promoState) return 0;
  if (promoState.type === "pct")
    return Math.round(sub * (Number(promoState.value) / 100));
  if (promoState.type === "mxn")
    return Math.min(sub, Number(promoState.value));
  return 0;
}

function normalizeCode(v) {
  return String(v || "").trim().toUpperCase().replace(/\s+/g, "");
}

/* =========================
   BOOT
========================= */

async function boot() {
  $("overlay")?.addEventListener("click", () => {
    closeAll();
    closeLegal();
  });

  document
    .querySelectorAll('input[name="shipMode"]')
    .forEach((r) =>
      r.addEventListener("change", () =>
        updateCart({ recalcShip: true })
      )
    );

  $("promoApplyBtn")?.addEventListener("click", applyPromo);

  const onAddrChange = debounce(
    () => updateCart({ recalcShip: true }),
    350
  );
  $("cp")?.addEventListener("input", onAddrChange);
  $("addr")?.addEventListener("input", onAddrChange);

  try {
    catalog = await fetchJSON(`/data/catalog.json?t=${Date.now()}`);
  } catch {
    toast("No se pudo cargar el catálogo.");
  }

  try {
    promos = await fetchJSON(`/data/promos.json?t=${Date.now()}`);
  } catch {
    promos = { active_promos: [] };
  }

  updateCart({ recalcShip: true });
}

/* =========================
   CART RENDER
========================= */

function saveCart() {
  localStorage.setItem(LS_CART, JSON.stringify(cart));
}

function renderCartBody() {
  const body = $("cartBody");
  if (!body) return;

  if (!cart.length) {
    body.innerHTML = `<div style="text-align:center;padding:40px;opacity:.6">Tu carrito está vacío</div>`;
    return;
  }

  body.innerHTML = cart
    .map(
      (i, idx) => `
    <div class="cartItem">
      <img src="${escapeHtml(i.img)}" alt="">
      <div class="cartItemInfo">
        <div class="cartItemName">${escapeHtml(i.name)}</div>
        <div class="cartItemMeta">Talla: ${escapeHtml(
          i.size || "Unitalla"
        )}</div>
        <div class="cartItemPrice">${moneyMXN(i.price)}</div>
      </div>
      <div class="cartItemActions">
        <button data-remove="${idx}">&times;</button>
        <div>x${i.qty}</div>
      </div>
    </div>
  `
    )
    .join("");

  body.querySelectorAll("button[data-remove]").forEach((b) =>
    b.addEventListener("click", () => {
      cart.splice(Number(b.dataset.remove), 1);
      saveCart();
      updateCart({ recalcShip: true });
    })
  );
}

/* =========================
   CART UPDATE
========================= */

async function updateCart({ recalcShip } = { recalcShip: true }) {
  const sub = subtotal();
  const disc = promoDiscountAmount(sub);
  const total = Math.max(0, sub - disc) + Number(ship.mxn || 0);

  $("cartCount").innerText = cartCount();
  $("lnSub").innerText = moneyMXN(sub);
  $("lnShip").innerText = moneyMXN(ship.mxn || 0);
  $("lnTotal").innerText = moneyMXN(total);
  $("barTotal").innerText = moneyMXN(total);

  const usd = total / getFx();
  $("lnUsd").textContent = `Aprox ${moneyUSD(usd)} USD`;

  renderCartBody();

  $("paybar")?.classList.toggle("visible", cart.length > 0);
  $("payBtn").disabled = cart.length === 0;
}

/* =========================
   CATALOG
========================= */

window.openCatalog = function (sectionId, title) {
  $("catTitle").innerText = title;
  const modal = $("modalCatalog");
  const content = $("catContent");

  const items = (catalog?.products || []).filter(
    (p) => p.sectionId === sectionId
  );

  if (!items.length) {
    content.innerHTML = `<div style="padding:40px;text-align:center">Próximamente</div>`;
  } else {
    const groups = {};
    items.forEach((p) => {
      const k = p.subSection || "GENERAL";
      if (!groups[k]) groups[k] = [];
      groups[k].push(p);
    });

    content.innerHTML = Object.keys(groups)
      .map(
        (k) => `
      <h4 class="catSectionTitle">${
        SUBSECTION_LABELS[k] || k
      }</h4>
      <div class="catGrid">
        ${groups[k]
          .map(
            (p) => `
          <div class="prodCard">
            <span class="badge">${
              STATUS_LABEL[p.status] || "Disponible"
            }</span>
            <img src="${p.img}" alt="${escapeHtml(p.name)}">
            <div class="prodName">${escapeHtml(p.name)}</div>
            <div class="prodPrice">${moneyMXN(p.baseMXN)}</div>
            <select id="size_${p.id}" class="sizeSelect">
              ${p.sizes
                .map((s) => `<option value="${s}">${s}</option>`)
                .join("")}
            </select>
            <button class="btn primary full" data-add="${p.id}">
              Agregar al carrito
            </button>
          </div>
        `
          )
          .join("")}
      </div>
    `
      )
      .join("");

    content.querySelectorAll("button[data-add]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.dataset.add;
        const p = catalog.products.find((x) => x.id === id);
        const size = $(`size_${id}`)?.value || "Unitalla";
        addToCart(p, size);
      })
    );
  }

  modal.classList.add("active");
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");
};

/* =========================
   ADD TO CART
========================= */

function addToCart(prod, size) {
  const key = `${prod.id}__${size}`;
  const found = cart.find((i) => i.key === key);

  if (found) found.qty += 1;
  else
    cart.push({
      key,
      id: prod.id,
      sku: prod.sku,
      name: prod.name,
      price: prod.baseMXN,
      img: prod.img,
      size,
      qty: 1,
    });

  saveCart();
  toast("Agregado al carrito");
  openDrawer();
}

/* =========================
   UI HELPERS
========================= */

window.openDrawer = function () {
  $("drawer").classList.add("active");
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");
  updateCart({ recalcShip: true });
};

window.closeAll = function () {
  $("drawer")?.classList.remove("active");
  $("modalCatalog")?.classList.remove("active");
  $("overlay")?.classList.remove("active");
  document.body.classList.remove("modalOpen");
};

/* =========================
   START
========================= */

boot();