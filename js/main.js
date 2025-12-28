let CATALOG = null;
let CART = [];

/* Helpers */
const $ = id => document.getElementById(id);
const money = n => `$${Number(n).toLocaleString("es-MX")} MXN`;

function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}

/* Load catalog */
async function loadCatalog() {
  if (CATALOG) return CATALOG;
  const res = await fetch("/data/catalog.json", { cache: "no-store" });
  CATALOG = await res.json();
  return CATALOG;
}

/* Overlay / Modals */
function openOverlay() {
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");
}
function closeOverlay() {
  $("overlay").classList.remove("active");
  document.body.classList.remove("modalOpen");
}
function openDrawer() { $("drawer").classList.add("active"); openOverlay(); }
function closeDrawer() { $("drawer").classList.remove("active"); }
function openModal(id) { $(id).classList.add("active"); openOverlay(); }
function closeModal(id) { $(id).classList.remove("active"); }
function closeAll() { closeDrawer(); closeModal("modalCatalog"); closeOverlay(); }

/* Open catalog */
async function openCatalog(sectionId, title) {
  const data = await loadCatalog();
  const wrap = $("catContent");
  $("catTitle").textContent = title;
  wrap.innerHTML = "";

  const items = data.products.filter(p => p.sectionId === sectionId);
  if (!items.length) {
    wrap.innerHTML = "<p>No hay productos disponibles.</p>";
    openModal("modalCatalog");
    return;
  }

  const groups = {};
  items.forEach(p => (groups[p.subSection] ||= []).push(p));

  Object.entries(groups).forEach(([sub, prods]) => {
    const h = document.createElement("h4");
    h.className = "catSectionTitle";
    h.textContent = sub;
    wrap.appendChild(h);

    const grid = document.createElement("div");
    grid.className = "catGrid";

    prods.forEach(p => {
      const card = document.createElement("div");
      card.className = "prodCard";
      card.innerHTML = `
        <img src="${p.img}" alt="${p.name}" loading="lazy">
        <strong>${p.name}</strong>
        <div class="ux-note">${money(p.baseMXN)}</div>
        <select>${p.sizes.map(s=>`<option>${s}</option>`).join("")}</select>
        <button class="btn-sm">AGREGAR</button>
      `;
      card.querySelector("button").onclick = () =>
        addToCart(p, card.querySelector("select").value);
      grid.appendChild(card);
    });

    wrap.appendChild(grid);
  });

  openModal("modalCatalog");
}

/* Cart */
function addToCart(p, size) {
  CART.push({ name: p.name, price: p.baseMXN, size });
  updateCart();
  showToast("Producto agregado");
}

function updateCart() {
  const body = $("cartBody");
  body.innerHTML = "";
  let total = 0;

  CART.forEach(i => {
    total += i.price;
    body.innerHTML += `<div class="sumRow">
      <span>${i.name} (${i.size})</span>
      <span>${money(i.price)}</span>
    </div>`;
  });

  $("lnSub").textContent = money(total);
  $("lnTotal").textContent = money(total);
  $("barTotal").textContent = money(total);
  $("cartCount").textContent = CART.length;
  $("payBtn").disabled = CART.length === 0;
  $("paybar").classList.toggle("visible", CART.length > 0);
}

/* Checkout */
async function checkout() {
  if (!CART.length) return;
  const r = await fetch("/.netlify/functions/create_checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: CART })
  });
  const d = await r.json();
  if (d.url) location.href = d.url;
}

$("overlay").onclick = closeAll;
document.addEventListener("keydown", e => e.key === "Escape" && closeAll());
window.addEventListener("load", () => document.body.classList.add("loaded"));