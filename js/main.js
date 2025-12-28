/* =========================================================
   SCORE STORE — MAIN.JS (FINAL / ESTABLE)
   - Catálogos funcionales
   - UX + Lighthouse
   - Netlify Functions ready
   ========================================================= */

"use strict";

/* =========================
   CONFIG
========================= */
const CATALOG_URL = "/data/catalog.json";
const FN_CREATE_CHECKOUT = "/.netlify/functions/create_checkout";
const FN_QUOTE_SHIPPING = "/.netlify/functions/quote_shipping";

let CATALOG = null;
let CART = [];

/* =========================
   HELPERS
========================= */
const $ = (id) => document.getElementById(id);

function money(v) {
  try {
    return `$${Number(v).toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN`;
  } catch {
    return `$${v} MXN`;
  }
}

function smoothScroll(e, id) {
  e?.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

/* =========================
   LOAD CATALOG
========================= */
async function loadCatalog() {
  if (CATALOG) return CATALOG;
  const res = await fetch(CATALOG_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo cargar el catálogo");
  CATALOG = await res.json();
  return CATALOG;
}

/* =========================
   MODALS / DRAWERS
========================= */
function openDrawer() {
  $("drawer")?.classList.add("active");
  $("overlay")?.classList.add("active");
}

function closeAll() {
  document.querySelectorAll(".drawer, .modal, .overlay")
    .forEach(el => el.classList.remove("active"));
}

/* =========================
   OPEN CATALOG
========================= */
async function openCatalog(sectionId, title) {
  const modal = $("modalCatalog");
  const content = $("catContent");
  const titleEl = $("catTitle");

  titleEl.textContent = title;
  content.innerHTML = "Cargando productos…";

  modal.classList.add("active");
  $("overlay")?.classList.add("active");

  const data = await loadCatalog();
  const products = data.products.filter(p => p.sectionId === sectionId);

  if (!products.length) {
    content.innerHTML = "<p>No hay productos disponibles.</p>";
    return;
  }

  // Agrupar por subSection
  const groups = {};
  products.forEach(p => {
    if (!groups[p.subSection]) groups[p.subSection] = [];
    groups[p.subSection].push(p);
  });

  content.innerHTML = "";

  Object.keys(groups).forEach(groupName => {
    const h = document.createElement("h4");
    h.className = "catSectionTitle";
    h.textContent = groupName;
    content.appendChild(h);

    const grid = document.createElement("div");
    grid.className = "catGrid";

    groups[groupName].forEach(p => {
      const card = document.createElement("div");
      card.className = "prodCard";
      card.innerHTML = `
        <img src="${p.img}" alt="${p.name}" loading="lazy" />
        <strong>${p.name}</strong>
        <div style="margin:6px 0">${money(p.baseMXN)}</div>

        <select aria-label="Talla">
          ${p.sizes.map(s => `<option value="${s}">${s}</option>`).join("")}
        </select>

        <button class="btn-sm full" type="button">
          AGREGAR
        </button>
      `;

      card.querySelector("button").onclick = () => {
        const size = card.querySelector("select").value;
        addToCart(p, size);
      };

      grid.appendChild(card);
    });

    content.appendChild(grid);
  });
}

/* =========================
   CART
========================= */
function addToCart(product, size) {
  CART.push({
    id: product.id,
    name: product.name,
    price: product.baseMXN,
    size,
    qty: 1
  });

  updateCart();
  openDrawer();
}

function updateCart() {
  const body = $("cartBody");
  if (!body) return;

  body.innerHTML = "";
  let subtotal = 0;

  CART.forEach((item, idx) => {
    subtotal += item.price * item.qty;

    const row = document.createElement("div");
    row.className = "sumRow";
    row.innerHTML = `
      <span>${item.qty}× ${item.name} (${item.size})</span>
      <span>${money(item.price)}</span>
    `;
    body.appendChild(row);
  });

  $("lnSub").textContent = money(subtotal);
  $("lnTotal").textContent = money(subtotal);
  $("barTotal").textContent = money(subtotal);
  $("cartCount").textContent = CART.length;

  $("payBtn").disabled = CART.length === 0;
}

/* =========================
   SHIPPING QUOTE
========================= */
async function quoteShipping() {
  const cp = $("cp")?.value;
  if (!cp || cp.length !== 5) return;

  const res = await fetch(FN_QUOTE_SHIPPING, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cp, items: CART })
  });

  const data = await res.json();
  if (data?.price) {
    $("lnShip").textContent = money(data.price);
    $("lnTotal").textContent = money(data.total);
    $("barTotal").textContent = money(data.total);
  }
}

/* =========================
   CHECKOUT
========================= */
async function checkout() {
  const res = await fetch(FN_CREATE_CHECKOUT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: CART })
  });

  const data = await res.json();
  if (data?.url) {
    window.location.href = data.url;
  } else {
    alert("No se pudo iniciar el pago");
  }
}

/* =========================
   EVENTS
========================= */
document.addEventListener("click", (e) => {
  if (e.target.id === "overlay") closeAll();
});

window.openCatalog = openCatalog;
window.openDrawer = openDrawer;
window.closeAll = closeAll;
window.checkout = checkout;
window.smoothScroll = smoothScroll;
window.quoteShipping = quoteShipping;