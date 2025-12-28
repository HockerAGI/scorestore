/* ======================================================
   SCORE STORE — MAIN JS (FINAL DEFINITIVO)
   ====================================================== */

let CATALOG = null;
let CART = [];
let CURRENT_SECTION = null;

/* ===========================
   HELPERS
=========================== */
const $ = (id) => document.getElementById(id);

function money(n) {
  return `$${Number(n).toLocaleString("es-MX")} MXN`;
}

function showToast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

/* ===========================
   LOAD CATALOG
=========================== */
async function loadCatalog() {
  if (CATALOG) return CATALOG;
  const res = await fetch("/data/catalog.json", { cache: "no-store" });
  CATALOG = await res.json();
  return CATALOG;
}

/* ===========================
   OVERLAY / DRAWER
=========================== */
function openOverlay() {
  $("overlay")?.classList.add("active");
  document.body.classList.add("modalOpen");
}

function closeOverlay() {
  $("overlay")?.classList.remove("active");
  document.body.classList.remove("modalOpen");
}

function openDrawer() {
  const d = $("drawer");
  if (!d) return;

  d.classList.add("active");
  $("cartBtnTrigger")?.setAttribute("aria-expanded", "true");
  openOverlay();
}

function closeDrawer() {
  const d = $("drawer");
  if (!d) return;

  d.classList.remove("active");
  $("cartBtnTrigger")?.setAttribute("aria-expanded", "false");
}

function openModal(id) {
  $(id)?.classList.add("active");
  openOverlay();
}

function closeModal(id) {
  $(id)?.classList.remove("active");
}

function closeAll() {
  closeDrawer();
  closeModal("modalCatalog");
  closeOverlay();
}

/* ===========================
   HERO SCROLL
=========================== */
function smoothScroll(e, id) {
  e?.preventDefault();
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ===========================
   CATALOG VIEW
=========================== */
async function openCatalog(sectionId, title) {
  const data = await loadCatalog();
  CURRENT_SECTION = sectionId;

  $("catTitle").textContent = title;
  const wrap = $("catContent");
  wrap.innerHTML = "";

  const products = data.products.filter(p => p.sectionId === sectionId);
  const grouped = {};

  products.forEach(p => {
    grouped[p.subSection] ||= [];
    grouped[p.subSection].push(p);
  });

  Object.keys(grouped).forEach(sub => {
    const h = document.createElement("h4");
    h.className = "catSectionTitle";
    h.textContent = sub;
    wrap.appendChild(h);

    const grid = document.createElement("div");
    grid.className = "catGrid";

    grouped[sub].forEach(p => {
      const card = document.createElement("div");
      card.className = "prodCard";

      card.innerHTML = `
        <img src="${p.img}" alt="${p.name}">
        <strong>${p.name}</strong>
        <div class="ux-note">${money(p.baseMXN)}</div>

        <select>
          ${p.sizes.map(s => `<option value="${s}">${s}</option>`).join("")}
        </select>

        <button class="btn-sm" type="button">AGREGAR</button>
      `;

      card.querySelector("img").addEventListener("load", e => {
        e.target.classList.add("loaded");
      });

      card.querySelector("button").onclick = () => {
        addToCart(p, card.querySelector("select").value);
      };

      grid.appendChild(card);
    });

    wrap.appendChild(grid);
  });

  openModal("modalCatalog");
}

/* ===========================
   CART LOGIC
=========================== */
function addToCart(prod, size) {
  CART.push({
    id: prod.id,
    name: prod.name,
    price: prod.baseMXN,
    size
  });

  updateCart();
  showToast("Producto agregado");
}

function removeFromCart(index) {
  CART.splice(index, 1);
  updateCart();
}

function updateCart() {
  const body = $("cartBody");
  body.innerHTML = "";

  let subtotal = 0;

  CART.forEach((p, i) => {
    subtotal += p.price;

    const row = document.createElement("div");
    row.className = "sumRow";
    row.innerHTML = `
      <span>${p.name} (${p.size})</span>
      <span>
        ${money(p.price)}
        <button onclick="removeFromCart(${i})" style="margin-left:8px;font-size:11px;">✕</button>
      </span>
    `;
    body.appendChild(row);
  });

  $("lnSub").textContent = money(subtotal);
  $("lnTotal").textContent = money(subtotal);
  $("barTotal").textContent = money(subtotal);

  $("cartCount").textContent = CART.length;
  $("payBtn").disabled = CART.length === 0;

  if (CART.length > 0) {
    $("paybar")?.classList.add("visible");
  } else {
    $("paybar")?.classList.remove("visible");
  }
}

/* ===========================
   CHECKOUT (STRIPE)
=========================== */
async function checkout() {
  if (CART.length === 0) return;

  try {
    const res = await fetch("/.netlify/functions/create_checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: CART })
    });

    const data = await res.json();
    if (data.url) window.location.href = data.url;
  } catch {
    alert("Error al iniciar pago");
  }
}

/* ===========================
   EVENTS
=========================== */
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeAll();
});

$("overlay")?.addEventListener("click", closeAll);

/* ===========================
   PERF / LCP
=========================== */
window.addEventListener("load", () => {
  document.body.classList.add("loaded");
});