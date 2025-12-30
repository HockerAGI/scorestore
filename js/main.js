/**
 * SCORE STORE — main.js (FINAL PROD)
 * Unificado y alineado con:
 * - index.html final
 * - CSS PRO unificado
 * - catalog.json real
 * - Netlify Functions (create_checkout)
 * - Stripe (NO se modifica lógica de backend)
 */

/* =========================
   CONFIG
========================= */

const USD_RATE_FALLBACK = 17.5;
const LS_CART = "score_cart_v1";
const LS_PROMO = "score_promo_v1";

/* =========================
   STATE
========================= */

let catalog = null;
let promos = null;

let cart = safeJson(localStorage.getItem(LS_CART), []);
let promoState = safeJson(localStorage.getItem(LS_PROMO), null);

let ship = {
  mode: "pickup",
  mxn: 0,
  label: "Pickup",
};

/* =========================
   HELPERS
========================= */

const $ = (q, r = document) => r.querySelector(q);
const $$ = (q, r = document) => Array.from(r.querySelectorAll(q));

function safeJson(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function moneyMXN(n) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(Number(n || 0));
}

function moneyUSD(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(n || 0));
}

function getFx() {
  return Number(catalog?.site?.fx_mxn_per_usd || USD_RATE_FALLBACK);
}

function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2600);
}

/* =========================
   STORAGE
========================= */

function saveCart() {
  localStorage.setItem(LS_CART, JSON.stringify(cart));
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

function promoDiscount(sub) {
  if (!promoState) return 0;
  if (promoState.type === "pct") {
    return Math.round(sub * (promoState.value / 100));
  }
  if (promoState.type === "mxn") {
    return Math.min(sub, promoState.value);
  }
  return 0;
}

/* =========================
   BOOT
========================= */

async function boot() {
  // Load catalog
  try {
    catalog = await fetchJSON(`/data/catalog.json?t=${Date.now()}`);
  } catch {
    toast("No se pudo cargar el catálogo");
    return;
  }

  // Load promos (optional)
  try {
    promos = await fetchJSON(`/data/promos.json?t=${Date.now()}`);
  } catch {
    promos = { active_promos: [] };
  }

  // Events
  document.addEventListener("score:openCatalog", (e) => {
    const { sectionId, title } = e.detail || {};
    openCatalog(sectionId, title);
  });

  // Shipping mode
  $$('input[name="shipMode"]').forEach((r) =>
    r.addEventListener("change", () => {
      ship.mode = r.value;
      updateCart();
    })
  );

  // Promo
  $("#promoApplyBtn")?.addEventListener("click", applyPromo);

  // Pay
  $("#payBtn")?.addEventListener("click", startCheckout);

  updateCart();
}

/* =========================
   CATALOG
========================= */

window.openCatalog = function (sectionId, title) {
  const wrap = $("#catContent");
  const modal = $("#modalCatalog");
  const overlay = $("#overlay");

  $("#catTitle").textContent = title || "CATÁLOGO";

  wrap.innerHTML = "";

  const items = catalog.products.filter(
    (p) => p.sectionId === sectionId
  );

  if (!items.length) {
    wrap.innerHTML = `<div class="emptyState"><h4>Próximamente</h4></div>`;
  } else {
    const grid = document.createElement("div");
    grid.className = "productGrid";

    items.forEach((p) => {
      let selectedSize = p.sizes?.[0] || "Unitalla";

      const card = document.createElement("div");
      card.className = "productCard";

      card.innerHTML = `
        <div class="productImg">
          <img src="${p.img}" alt="${p.name}">
          <span class="badge ${
            p.status === "low_stock" ? "limited" : "available"
          }">
            ${p.status === "low_stock" ? "EDICIÓN LIMITADA" : "DISPONIBLE"}
          </span>
        </div>
        <div class="productInfo">
          <h4>${p.name}</h4>
          <div class="sku">${p.sku || ""}</div>
          <div class="price">${moneyMXN(p.baseMXN)}</div>
          <div class="sizeRow">
            ${p.sizes
              .map(
                (s) =>
                  `<button class="sizeBtn ${
                    s === selectedSize ? "active" : ""
                  }">${s}</button>`
              )
              .join("")}
          </div>
          <button class="addBtn">AGREGAR AL CARRITO</button>
        </div>
      `;

      // Size selection
      card.querySelectorAll(".sizeBtn").forEach((b) => {
        b.addEventListener("click", () => {
          card
            .querySelectorAll(".sizeBtn")
            .forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          selectedSize = b.textContent;
        });
      });

      // Add to cart
      card.querySelector(".addBtn").addEventListener("click", () => {
        addToCart(p, selectedSize);
      });

      grid.appendChild(card);
    });

    wrap.appendChild(grid);
    wrap.dataset.filled = "1";
  }

  modal.classList.add("active");
  overlay.classList.add("active");
  document.body.classList.add("modalOpen");
};

/* =========================
   ADD TO CART
========================= */

function addToCart(prod, size) {
  const key = `${prod.id}__${size}`;
  const found = cart.find((i) => i.key === key);

  if (found) found.qty += 1;
  else {
    cart.push({
      key,
      id: prod.id,
      sku: prod.sku,
      name: prod.name,
      img: prod.img,
      size,
      price: prod.baseMXN,
      qty: 1,
    });
  }

  saveCart();
  updateCart();
  toast("Producto agregado al carrito");
  openDrawer();
}

/* =========================
   CART RENDER
========================= */

window.renderCart = function () {
  const body = $("#cartBody");
  body.innerHTML = "";

  if (!cart.length) {
    body.innerHTML = `<div class="emptyState"><p>Tu carrito está vacío</p></div>`;
    return;
  }

  cart.forEach((item) => {
    const el = document.createElement("div");
    el.className = "cartItem";

    el.innerHTML = `
      <img src="${item.img}" alt="">
      <div class="cartMeta">
        <strong>${item.name}</strong>
        <span>Talla: ${item.size}</span>
        <div class="qtyRow">
          <button class="qtyBtn">−</button>
          <span>${item.qty}</span>
          <button class="qtyBtn">+</button>
        </div>
      </div>
      <div class="cartRight">
        <span class="itemPrice">${moneyMXN(
          item.price * item.qty
        )}</span>
        <button class="removeBtn">✕</button>
      </div>
    `;

    const [decBtn, incBtn] = el.querySelectorAll(".qtyBtn");

    decBtn.onclick = () => {
      item.qty--;
      if (item.qty <= 0) cart = cart.filter((c) => c !== item);
      saveCart();
      updateCart();
    };

    incBtn.onclick = () => {
      item.qty++;
      saveCart();
      updateCart();
    };

    el.querySelector(".removeBtn").onclick = () => {
      cart = cart.filter((c) => c !== item);
      saveCart();
      updateCart();
    };

    body.appendChild(el);
  });
};

/* =========================
   CART UPDATE
========================= */

function updateCart() {
  const sub = subtotal();
  const disc = promoDiscount(sub);
  const total = Math.max(0, sub - disc) + Number(ship.mxn || 0);

  $("#cartCount").textContent = cartCount();
  $("#lnSub").textContent = moneyMXN(sub);
  $("#lnShip").textContent = moneyMXN(ship.mxn || 0);
  $("#lnTotal").textContent = moneyMXN(total);
  $("#barTotal").textContent = moneyMXN(total);

  const usd = total / getFx();
  $("#lnUsd").textContent = `Aprox ${moneyUSD(usd)} USD`;

  renderCart();

  $("#paybar")?.classList.toggle("visible", cart.length > 0);
  $("#payBtn").disabled = cart.length === 0;
}

/* =========================
   PROMO
========================= */

function applyPromo() {
  const code = $("#promoInput").value.trim().toUpperCase();
  const p = promos?.active_promos?.find((x) => x.code === code);

  if (!p) {
    toast("Cupón no válido");
    return;
  }

  promoState = p;
  localStorage.setItem(LS_PROMO, JSON.stringify(p));
  toast("Cupón aplicado");
  updateCart();
}

/* =========================
   CHECKOUT (NO BACKEND CHANGES)
========================= */

async function startCheckout() {
  if (!cart.length) return;

  const payload = {
    items: cart.map((i) => ({
      id: i.id,
      qty: i.qty,
      size: i.size,
    })),
    mode: ship.mode,
    promoCode: promoState?.code || "",
    to: {
      name: $("#name")?.value,
      postal_code: $("#cp")?.value,
      address1: $("#addr")?.value,
      city: $("#city")?.value,
      state_code: $("#state")?.value,
    },
  };

  try {
    const res = await fetch("/api/create_checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (data?.url) window.location.href = data.url;
    else toast("No se pudo iniciar el pago");
  } catch {
    toast("Error al conectar con pagos");
  }
}

/* =========================
   UI HELPERS
========================= */

window.openDrawer = function () {
  $("#drawer").classList.add("active");
  $("#overlay").classList.add("active");
  document.body.classList.add("modalOpen");
  updateCart();
};

window.closeAll = function () {
  $("#drawer")?.classList.remove("active");
  $("#modalCatalog")?.classList.remove("active");
  $("#overlay")?.classList.remove("active");
  document.body.classList.remove("modalOpen");
};

/* =========================
   FETCH
========================= */

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
   START
========================= */

boot();