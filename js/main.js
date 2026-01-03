/* SCORE STORE LOGIC — FINAL MASTER */

const API_BASE =
  (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "/api"
    : "/.netlify/functions";

const CART_KEY = "score_cart_final_v18";

let cart = [];
let catalog = [];
let shipQuote = null;

const $ = (id) => document.getElementById(id);
const money = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

/* ================= UTIL ================= */
function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.innerText = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

/* ================= INIT ================= */
async function init() {
  loadCart();
  renderCart();

  try {
    const res = await fetch("/data/catalog.json");
    const data = await res.json();
    catalog = data.products || [];
  } catch (e) {
    console.error("Catalog error:", e);
  }

  document
    .querySelectorAll('input[name="shipMode"]')
    .forEach((r) => r.addEventListener("change", updateTotals));

  $("cp")?.addEventListener("input", (e) => {
    if (e.target.value.length === 5) quoteShipping(e.target.value);
  });

  updateTotals();
}

/* ================= CATALOG ================= */
window.openCatalog = (secId) => {
  $("modalCatalog").classList.add("active");
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");

  const items = catalog.filter((p) => p.sectionId === secId);
  $("catContent").innerHTML = `
    <div class="catGrid">
      ${items.map(p => `
        <div class="prodCard">
          <div class="metallic-frame">
            <img src="${location.origin}${p.img}"
              class="prodImg"
              onerror="this.src='/assets/img-placeholder.webp'">
          </div>
          <div class="prodName">${p.name}</div>
          <div class="prodPrice">${money(p.baseMXN)}</div>
          <div class="size-row">
            ${(p.sizes || ["Unitalla"]).map(s =>
              `<div class="size-pill" onclick="selectSize(this,'${s}')">${s}</div>`
            ).join("")}
          </div>
          <div id="sizes_${p.id}" data-selected="" hidden></div>
          <button class="btn-add" onclick="add('${p.id}')">AGREGAR +</button>
        </div>
      `).join("")}
    </div>`;
};

/* ================= SIZE ================= */
window.selectSize = (el, s) => {
  const parent = el.parentElement;
  parent.nextElementSibling.dataset.selected = s;
  parent.querySelectorAll(".size-pill").forEach(b => b.classList.remove("active"));
  el.classList.add("active");
};

/* ================= CART ================= */
window.add = (id) => {
  const size = document.getElementById(`sizes_${id}`)?.dataset.selected;
  if (!size) return toast("Selecciona talla");

  const p = catalog.find(x => x.id === id);
  const key = `${id}_${size}`;
  const found = cart.find(i => i.key === key);

  if (found) found.qty++;
  else cart.push({ key, id, size, name: p.name, price: p.baseMXN, qty: 1, img: p.img });

  saveCart();
  renderCart();
  openDrawer();
};

function renderCart() {
  const wrap = $("cartItems");
  if (!cart.length) {
    wrap.innerHTML = "";
    $("cartEmpty").style.display = "block";
    updateTotals();
    return;
  }

  $("cartEmpty").style.display = "none";
  wrap.innerHTML = cart.map((i, x) => `
    <div class="cartItem">
      <img src="${location.origin}${i.img}" class="cartThumb">
      <div>
        <strong>${i.name}</strong><br>
        <small>Talla: ${i.size}</small><br>
        ${money(i.price)}
      </div>
      <button onclick="delCart(${x})">×</button>
    </div>
  `).join("");

  updateTotals();
}

window.delCart = (i) => {
  cart.splice(i, 1);
  saveCart();
  renderCart();
};

function loadCart() {
  cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

/* ================= SHIPPING ================= */
async function quoteShipping(zip) {
  try {
    const r = await fetch(`${API_BASE}/quote_shipping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postal_code: zip, items: cart.length }),
    });
    shipQuote = await r.json();
  } catch {}
  updateTotals();
}

function updateTotals() {
  const sub = cart.reduce((a, b) => a + b.price * b.qty, 0);
  $("subTotal").innerText = money(sub);

  const mode = document.querySelector('input[name="shipMode"]:checked')?.value;
  let ship = 0;

  if (mode === "tj") ship = 200;
  if (mode === "mx") ship = shipQuote?.mxn || 250;

  $("shipTotal").innerText = ship ? money(ship) : "Gratis";
  $("grandTotal").innerText = money(sub + ship);
}

/* ================= CHECKOUT ================= */
window.checkout = async () => {
  if (!cart.length) return;

  const payload = {
    mode: document.querySelector('input[name="shipMode"]:checked')?.value || "pickup",
    to: {
      postal_code: $("cp")?.value,
      address1: $("addr")?.value,
      name: $("name")?.value,
    },
    items: cart.map(i => ({ id: i.id, qty: i.qty, size: i.size })),
  };

  try {
    const r = await fetch(`${API_BASE}/create_checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    if (d.url) location.href = d.url;
  } catch {
    toast("Error iniciando pago");
  }
};

/* ================= UI ================= */
window.openDrawer = () => {
  $("drawer").classList.add("active");
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");
};

window.closeAll = () => {
  document.querySelectorAll(".active").forEach(e => e.classList.remove("active"));
  document.body.classList.remove("modalOpen");
};

/* ================= START ================= */
init();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}