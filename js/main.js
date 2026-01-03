/* SCORE STORE LOGIC — FINAL MASTER + PROMOS */

const API_BASE =
  (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "/api"
    : "/.netlify/functions";

const CART_KEY = "score_cart_final_v18";
const PROMO_KEY = "score_promo_applied_v1";

let cart = [];
let catalog = [];
let promos = [];
let shipQuote = null;
let appliedPromo = null;

const $ = (id) => document.getElementById(id);
const money = (n) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(n || 0);

/* ================= UTIL ================= */
function scrollToId(id) {
  const el = $(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.innerText = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

/* ================= LOGOS ================= */
const LOGOS = {
  BAJA_1000: "/assets/logo-baja1000.webp",
  BAJA_500: "/assets/logo-baja500.webp",
  BAJA_400: "/assets/logo-baja400.webp",
  SF_250: "/assets/logo-sf250.webp",
};

/* ================= INIT ================= */
async function init() {
  loadCart();
  loadPromo();
  renderCart();

  try {
    const [catRes, promoRes] = await Promise.all([
      fetch("/data/catalog.json"),
      fetch("/data/promos.json"),
    ]);
    const catData = await catRes.json();
    const promoData = await promoRes.json();
    catalog = catData.products || [];
    promos = promoData.rules || [];
  } catch (e) {
    console.error("Init error:", e);
  }

  document
    .querySelectorAll('input[name="shipMode"]')
    .forEach((r) => r.addEventListener("change", updateTotals));

  $("cp")?.addEventListener("input", (e) => {
    if (e.target.value.length === 5) quoteShipping(e.target.value);
  });

  injectPromoUI();
  updateTotals();
}

/* ================= PROMOS ================= */
function loadPromo() {
  try {
    appliedPromo = JSON.parse(localStorage.getItem(PROMO_KEY));
  } catch {
    appliedPromo = null;
  }
}

function savePromo() {
  localStorage.setItem(PROMO_KEY, JSON.stringify(appliedPromo));
}

function injectPromoUI() {
  const foot = document.querySelector("#drawer .dFoot");
  if (!foot || $("promoWrap")) return;

  const wrap = document.createElement("div");
  wrap.id = "promoWrap";
  wrap.style.marginBottom = "12px";

  wrap.innerHTML = `
    <div style="display:flex;gap:8px;">
      <input id="promoInput" class="inputField" placeholder="Código promocional">
      <button id="promoBtn" class="btn secondary" style="padding:10px 18px;">Aplicar</button>
    </div>
    <div id="promoInfo" style="margin-top:6px;font-size:13px;color:#0a7;"></div>
  `;

  foot.insertBefore(wrap, foot.firstChild);

  $("promoBtn").addEventListener("click", applyPromo);
}

function applyPromo() {
  const code = $("promoInput").value.trim().toUpperCase();
  if (!code) return;

  const rule = promos.find((r) => r.code === code && r.active);
  if (!rule) {
    toast("Código inválido");
    return;
  }

  appliedPromo = rule;
  savePromo();
  $("promoInfo").innerText = `Código aplicado: ${rule.code}`;
  toast("Promoción aplicada");
  updateTotals();
}

/* ================= CATALOG ================= */
window.openCatalog = (secId, title) => {
  $("modalCatalog").classList.add("active");
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");

  const logoUrl = LOGOS[secId];
  $("catTitle").innerHTML = logoUrl
    ? `<img src="${logoUrl}" alt="${title}">`
    : title;

  const items = catalog.filter((p) => p.sectionId === secId);
  if (!items.length) {
    $("catContent").innerHTML = "<p style='padding:40px'>Agotado</p>";
    return;
  }

  $("catContent").innerHTML =
    `<div class="catGrid">` +
    items
      .map((p) => {
        const sizes = p.sizes || ["Unitalla"];
        return `
        <div class="prodCard">
          <div class="metallic-frame">
            <img src="${location.origin}${p.img}" class="prodImg" loading="lazy">
          </div>
          <div class="prodName">${p.name}</div>
          <div class="prodPrice">${money(p.baseMXN)}</div>
          <div class="size-row">
            ${sizes
              .map(
                (s) =>
                  `<div class="size-pill" onclick="selectSize(this,'${s}')">${s}</div>`
              )
              .join("")}
          </div>
          <div id="sizes_${p.id}" data-selected="" style="display:none"></div>
          <button class="btn-add" onclick="add('${p.id}')">AGREGAR +</button>
        </div>`;
      })
      .join("") +
    `</div>`;
};

window.selectSize = (el, s) => {
  const parent = el.parentElement;
  parent.nextElementSibling.setAttribute("data-selected", s);
  parent.querySelectorAll(".size-pill").forEach((b) => b.classList.remove("active"));
  el.classList.add("active");
};

/* ================= CART ================= */
window.add = (id) => {
  const sizeEl = document.getElementById(`sizes_${id}`);
  let size = sizeEl.getAttribute("data-selected");
  if (!size) return toast("Selecciona talla");

  const p = catalog.find((x) => x.id === id);
  const key = `${id}_${size}`;
  const exist = cart.find((i) => i.key === key);

  if (exist) exist.qty++;
  else cart.push({ key, id, name: p.name, size, price: p.baseMXN, qty: 1, img: p.img });

  saveCart();
  renderCart();
  openDrawer();
};

function loadCart() {
  try {
    cart = JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    cart = [];
  }
}
function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function renderCart() {
  const wrap = $("cartItems");
  const count = cart.reduce((a, b) => a + b.qty, 0);
  $("cartCount").innerText = count;
  $("cartCount").style.display = count ? "flex" : "none";

  if (!cart.length) {
    wrap.innerHTML = "";
    $("cartEmpty").style.display = "block";
    updateTotals();
    return;
  }

  $("cartEmpty").style.display = "none";
  wrap.innerHTML = cart
    .map(
      (i, x) => `
      <div class="cartItem">
        <img src="${location.origin}${i.img}" class="cartThumb">
        <div class="cInfo">
          <div class="cName">${i.name}</div>
          <div class="cMeta">Talla: ${i.size}</div>
          <div class="cPrice">${money(i.price)}</div>
        </div>
        <button onclick="delCart(${x})">&times;</button>
      </div>`
    )
    .join("");

  updateTotals();
}

window.delCart = (x) => {
  cart.splice(x, 1);
  saveCart();
  renderCart();
};

/* ================= SHIPPING & TOTALS ================= */
async function quoteShipping(zip) {
  try {
    const pieces = cart.reduce((a, b) => a + b.qty, 0) || 1;
    const r = await fetch(`${API_BASE}/quote_shipping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postal_code: zip, items: pieces }),
    });
    shipQuote = await r.json();
  } catch {}
  updateTotals();
}

function updateTotals() {
  const sub = cart.reduce((a, b) => a + b.price * b.qty, 0);
  let discount = 0;
  let ship = 0;

  const mode =
    document.querySelector('input[name="shipMode"]:checked')?.value || "pickup";

  if (mode === "tj") ship = 200;
  if (mode === "mx") ship = shipQuote?.mxn || 250;

  if (appliedPromo) {
    if (appliedPromo.type === "percent") discount = sub * appliedPromo.value;
    if (appliedPromo.type === "fixed_mxn") discount = appliedPromo.value;
    if (appliedPromo.type === "free_shipping") ship = 0;
  }

  $("subTotal").innerText = money(sub);
  $("shipTotal").innerText = money(ship);
  $("grandTotal").innerText = money(sub - discount + ship);
}

/* ================= UI ================= */
window.openDrawer = () => {
  $("drawer").classList.add("active");
  $("overlay").classList.add("active");
  document.body.classList.add("modalOpen");
};
window.closeAll = () => {
  document.querySelectorAll(".active").forEach((e) => e.classList.remove("active"));
  document.body.classList.remove("modalOpen");
};

/* ================= START ================= */
init();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}