/* ======================================================
   SCORE STORE — MAIN.JS FINAL PRODUCCIÓN
   Catálogo + Carrito + Checkout (Stripe / Netlify)
   ====================================================== */

/* ---------- STATE ---------- */
let CATALOG = [];
let CART = JSON.parse(localStorage.getItem("score_cart") || "[]");

const $ = id => document.getElementById(id);
const money = n => `$${Number(n || 0).toLocaleString("es-MX")} MXN`;

/* ---------- HELPERS ---------- */
function cartKey(id, size) {
  return size ? `${id}__${size}` : id;
}

function saveCart() {
  localStorage.setItem("score_cart", JSON.stringify(CART));
}

/* ---------- LOAD CATALOG ---------- */
async function loadCatalog() {
  try {
    const res = await fetch("/data/catalog.json?t=" + Date.now());
    const data = await res.json();
    CATALOG = data.products || [];
    renderCatalog();
  } catch (err) {
    console.error("Error cargando catálogo", err);
  }
}

/* ---------- RENDER ---------- */
function renderCatalog() {
  const grid = $("catalog");
  if (!grid) return;

  grid.innerHTML = "";

  CATALOG.forEach(p => {
    const card = document.createElement("div");
    card.className = "card";

    const sizes = (p.sizes || []).map(
      s => `<option value="${s}">${s}</option>`
    ).join("");

    card.innerHTML = `
      <img src="${p.image}" alt="${p.name}">
      <div class="cardBody">
        <h3>${p.name}</h3>
        <div class="price">${money(p.price)}</div>
        ${
          p.sizes && p.sizes.length > 1
            ? `<select id="size_${p.id}" class="select">${sizes}</select>`
            : ""
        }
        <button class="btn" data-id="${p.id}">Agregar</button>
      </div>
    `;

    card.querySelector("button").onclick = () => {
      const sizeEl = $("size_" + p.id);
      const size = sizeEl ? sizeEl.value : null;
      addToCart(p, size);
    };

    grid.appendChild(card);
  });
}

/* ---------- CART ---------- */
function addToCart(product, size = null) {
  const key = cartKey(product.id, size);
  const found = CART.find(i => i.key === key);

  if (found) {
    found.qty += 1;
  } else {
    CART.push({
      key,
      id: product.id,
      name: product.name,
      price: product.price,
      size,
      qty: 1
    });
  }

  saveCart();
  updateTotals();
}

function removeFromCart(key) {
  CART = CART.filter(i => i.key !== key);
  saveCart();
  updateTotals();
}

function changeQty(key, delta) {
  const item = CART.find(i => i.key === key);
  if (!item) return;

  item.qty += delta;
  if (item.qty <= 0) {
    CART = CART.filter(i => i.key !== key);
  }

  saveCart();
  updateTotals();
}

/* ---------- TOTALS ---------- */
function updateTotals() {
  const subtotal = CART.reduce((s, i) => s + (i.price * i.qty), 0);

  const totalEl =
    $("paybarTotal") ||
    $("barTotal") ||
    $("grandTotal");

  if (totalEl) totalEl.textContent = money(subtotal);

  const payBtn = $("payBtn");
  if (payBtn) payBtn.disabled = CART.length === 0;
}

/* ---------- CHECKOUT ---------- */
async function checkout() {
  if (!CART.length) {
    alert("Tu carrito está vacío.");
    return;
  }

  const shipMethodEl = $("shipMethod");
  const mode = shipMethodEl ? shipMethodEl.value : "pickup";

  const payload = {
    mode,
    items: CART.map(i => ({
      id: i.id,
      qty: i.qty,
      size: i.size || null
    }))
  };

  try {
    const res = await fetch("/.netlify/functions/create_checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error(data.error || "Error iniciando pago");
    }
  } catch (err) {
    console.error(err);
    alert(err.message || "Error procesando el pago");
  }
}

/* ---------- INIT ---------- */
window.addEventListener("load", () => {
  loadCatalog();
  updateTotals();
});